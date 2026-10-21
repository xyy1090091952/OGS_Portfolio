import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, Euler, Group, MathUtils, PerspectiveCamera,
  Mesh, Quaternion, Raycaster, RectAreaLight, Scene, Texture, Vector2, Vector3, WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createDiscModel, type DiscModel } from './disc-model';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { DISC_3D, DISC_LIGHTING } from './disc-config';
import { createDiscEnvironment } from './disc-materials';
import { DiscHighlight } from './disc-highlight';
import { getDiscPlacement, getGalleryLayout, type GalleryLayout } from './disc-layout';
import { GALLERY_LAYOUT, GALLERY_MOTION } from './gallery-config';
import { PROJECTS, type Project } from './data';
import { DISC_TRANSITION, runDiscTimeline, sampleDiscTransition, type DiscTransitionDirection } from './disc-transition';
import { LOADING } from './loading-config';
import { openingScale, type OpeningDriver } from './disc-opening';

interface RotationTween {
  from: Quaternion;
  elapsed: number;
}

interface Pose {
  model: DiscModel;
  mount: Group;
  flight: Group;
  flow: Group;
  lean: number;
  followProgress: number;
  response: Group;
  hover: Vector3;
  hoverTarget: Vector3;
  hoverVelocity: Vector3;
  perspectiveScale: number;
  rotation: RotationTween | null;
}

const BASE_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 6, -Math.PI / 6, 0));

/** 渲染层不管理作品选择；只接收画廊的位置，并维护每张光盘自己的三维姿态。 */
export class DiscScene {
  readonly element: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  // 缩小深度范围，让薄光盘的印刷面与实体表面保持清晰，避免深度冲突闪纹。
  private camera = new PerspectiveCamera(35, 1, 100, 5000);
  private environment: WebGLRenderTarget;
  private models = new Map<string, Pose>();
  private raycaster = new Raycaster();
  private projects: Project[] = [];
  private layout: GalleryLayout = getGalleryLayout(1440, 900);
  private progress = 0;
  private flowVelocity = 0;
  private layoutBusy = false;
  private width = 0;
  private height = 0;
  private dragging: string | null = null;
  private hoverPoint: Vector2 | null = null;
  private hoverDirty = false;
  private hovered: string | null = null;
  private highlight: DiscHighlight;
  private strip: RectAreaLight;
  private flightLayer: HTMLElement | null = null;
  private lost = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private host: HTMLElement,
    private wake: () => void,
    private availability: (available: boolean) => void,
  ) {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, DISC_3D.pixelRatioLimit));
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DISC_LIGHTING.exposure;
    this.renderer.transmissionResolutionScale = .5;
    this.element = this.renderer.domElement;
    this.element.className = 'disc-webgl-canvas';
    // 显隐交由页面样式控制，避免 Three.js 默认的内联 display 覆盖回退状态。
    this.element.style.removeProperty('display');
    this.element.setAttribute('aria-hidden', 'true');
    this.environment = createDiscEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.highlight = new DiscHighlight(this.wake);
    this.scene.add(this.highlight.group);
    this.scene.add(new AmbientLight('#ffffff', DISC_LIGHTING.ambient));
    for (const config of [DISC_LIGHTING.key, DISC_LIGHTING.fill, DISC_LIGHTING.rim]) {
      const light = new DirectionalLight(config.color, config.intensity);
      light.position.set(config.position[0], config.position[1], config.position[2]);
      this.scene.add(light);
    }
    RectAreaLightUniformsLib.init();
    this.strip = new RectAreaLight('#ffffff', DISC_LIGHTING.strip.intensity, DISC_LIGHTING.strip.width, DISC_LIGHTING.strip.height);
    this.scene.add(this.strip);
    this.element.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.lost = true;
      this.pause();
      this.availability(false);
    });
    this.element.addEventListener('webglcontextrestored', () => {
      this.environment.dispose();
      this.environment = createDiscEnvironment(this.renderer);
      this.scene.environment = this.environment.texture;
      this.lost = false;
      this.availability(true);
      this.wake();
    });
  }

  setProjects(projects: Project[]) {
    this.clearHover();
    this.highlight.hide();
    this.projects = projects;
    this.models.forEach(pose => { pose.mount.visible = false; });
    projects.forEach(project => {
      if (!this.models.has(project.id)) {
        const model = createDiscModel(project, PROJECTS.indexOf(project));
        const mount = new Group();
        // 陈列 > 页面转场 > 运动倾斜 > 悬停 > 手动姿态，各层可独立复位。
        const flight = new Group();
        const flow = new Group();
        const response = new Group();
        response.add(model.group);
        flow.add(response);
        flight.add(flow);
        mount.add(flight);
        this.scene.add(mount);
        model.group.quaternion.copy(BASE_ROTATION);
        this.models.set(project.id, {
          model, mount, flight, flow, lean: 0, followProgress: this.progress,
          response, hover: new Vector3(), hoverTarget: new Vector3(), hoverVelocity: new Vector3(),
          perspectiveScale: 1,
          rotation: null,
        });
      }
      this.models.get(project.id)!.mount.visible = true;
    });
    this.host.append(this.element);
  }

  updateLayout(layout: GalleryLayout, progress: number, velocity = 0, dt = 0) {
    const changedMode = this.layout.mode !== layout.mode;
    this.layout = layout;
    if (Math.abs(progress - this.progress) > .001 && this.hoverPoint) this.hoverDirty = true;
    this.progress = progress;
    this.flowVelocity = velocity;
    this.layoutBusy = false;
    const viewport = this.flightLayer ?? this.host;
    // 直接打开详情时画廊隐藏，仍按视口预热，返回首页无需第一次编译。
    const width = viewport.clientWidth || innerWidth, height = viewport.clientHeight || innerHeight;
    if (!width || !height || this.lost) return;
    const ratioLimit = width <= GALLERY_LAYOUT.phoneWidth ? DISC_3D.mobilePixelRatioLimit : DISC_3D.pixelRatioLimit;
    const ratio = Math.min(devicePixelRatio, ratioLimit, Math.sqrt(DISC_3D.maxRenderPixels / (width * height)));
    const resized = this.width !== width || this.height !== height || this.renderer.getPixelRatio() !== ratio;
    if (resized) {
      this.width = width; this.height = height;
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.position.z = height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)));
      this.camera.updateProjectionMatrix();
    }
    const lightScale = layout.size / 2;
    this.strip.width = DISC_LIGHTING.strip.width * lightScale;
    this.strip.height = DISC_LIGHTING.strip.height * lightScale;
    this.strip.position.set(...DISC_LIGHTING.strip.position).multiplyScalar(lightScale);
    this.strip.lookAt(0, 0, 0);
    let near = Infinity, far = 0;
    this.projects.forEach((project, index) => {
      const pose = this.models.get(project.id)!;
      const offset = index - progress;
      const wasVisible = pose.mount.visible;
      pose.mount.visible = Math.abs(offset) < layout.visibleRange;
      if (!pose.mount.visible) return;
      const flow = GALLERY_MOTION.flow;
      const follow = Math.max(flow.minFollow, flow.discFollow - Math.abs(offset) * flow.distanceFalloff);
      if (!dt || changedMode || resized || !wasVisible || this.reduced.matches) pose.followProgress = progress;
      else {
        pose.followProgress += (progress - pose.followProgress) * (1 - Math.exp(-follow * dt / 1000));
        pose.followProgress = MathUtils.clamp(pose.followProgress, progress - flow.maxLag, progress + flow.maxLag);
        if (Math.abs(pose.followProgress - progress) < GALLERY_MOTION.settleEpsilon) pose.followProgress = progress;
      }
      if (pose.followProgress !== progress) this.layoutBusy = true;
      // 深度以公共 offset 分配，少量跟随只改变屏幕位置，任意旋转仍不相交。
      const placement = getDiscPlacement(layout, offset, this.camera.position.z, index - pose.followProgress);
      pose.perspectiveScale = placement.perspectiveScale;
      pose.mount.scale.setScalar(placement.radius);
      pose.mount.position.set(placement.x, placement.y, placement.z);
      near = Math.min(near, placement.near);
      far = Math.max(far, placement.far);
    });
    // 相机只覆盖可见光盘的深度区间，保留薄盘面需要的深度精度。
    if (Number.isFinite(near) && far > 0) {
      const nextNear = Math.max(1, near * .8), nextFar = far * 1.1;
      if (this.camera.near !== nextNear || this.camera.far !== nextFar) {
        this.camera.near = nextNear;
        this.camera.far = nextFar;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /** 射线命中真实几何，光盘中心的孔和外侧空白不会被误认为光盘表面。 */
  hitTest(clientX: number, clientY: number): string | null {
    if (this.lost) return null;
    const bounds = this.host.getBoundingClientRect();
    const point = new Vector2((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(point, this.camera);
    const roots = [...this.models.values()].filter(pose => pose.mount.visible).map(pose => pose.mount);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (!hit) return null;
    let object = hit.object;
    while (object.parent && !object.userData.projectId) object = object.parent;
    return object.userData.projectId ?? null;
  }

  hoverAt(clientX: number, clientY: number) {
    if (this.dragging || this.lost) return;
    this.hoverPoint = new Vector2(clientX, clientY);
    this.hoverDirty = true;
    this.wake();
  }

  clearHover() {
    this.hoverPoint = null;
    this.hovered = null;
    this.hoverDirty = false;
    this.models.forEach(pose => pose.hoverTarget.set(0, 0, 0));
    this.host.classList.remove('is-over-disc');
    this.wake();
  }

  private updateHoverTarget() {
    if (!this.hoverDirty || !this.hoverPoint) return;
    this.hoverDirty = false;
    const { x, y } = this.hoverPoint;
    this.hovered = this.hitTest(x, y);
    this.host.classList.toggle('is-over-disc', !!this.hovered);
    this.models.forEach(pose => pose.hoverTarget.set(0, 0, 0));
    if (!this.hovered || this.reduced.matches) return;
    const pose = this.models.get(this.hovered)!;
    const bounds = this.host.getBoundingClientRect();
    const center = pose.mount.position.clone().project(this.camera);
    const centerX = bounds.left + (center.x + 1) * this.width / 2;
    const centerY = bounds.top + (1 - center.y) * this.height / 2;
    const radius = pose.mount.scale.x / pose.perspectiveScale;
    pose.hoverTarget.set(
      MathUtils.clamp(-(y - centerY) / radius, -1, 1) * DISC_3D.hoverTilt,
      MathUtils.clamp((x - centerX) / radius, -1, 1) * DISC_3D.hoverTilt,
      1,
    );
  }

  private stepHover(pose: Pose, dt: number) {
    if (this.reduced.matches) {
      pose.hover.set(0, 0, 0);
      pose.hoverVelocity.set(0, 0, 0);
    } else {
      // 小步长积分让 60Hz / 120Hz 与偶发掉帧下的回弹速度接近。
      const steps = Math.max(1, Math.ceil(dt / 8));
      const h = dt / steps / 1000;
      for (let i = 0; i < steps; i++) {
        pose.hoverVelocity.addScaledVector(pose.hoverTarget.clone().sub(pose.hover), DISC_3D.hoverSpring * h);
        pose.hoverVelocity.multiplyScalar(Math.exp(-DISC_3D.hoverDamping * h));
        pose.hover.addScaledVector(pose.hoverVelocity, h);
      }
    }
    const busy = pose.hover.distanceTo(pose.hoverTarget) > DISC_3D.hoverEpsilon || pose.hoverVelocity.length() > DISC_3D.hoverEpsilon;
    if (!busy && !this.reduced.matches) {
      pose.hover.copy(pose.hoverTarget);
      pose.hoverVelocity.set(0, 0, 0);
    }
    pose.response.rotation.set(pose.hover.x, pose.hover.y, -pose.hover.y * .12);
    pose.response.position.z = pose.hover.z * DISC_3D.hoverLift * pose.perspectiveScale / Math.max(1, pose.mount.scale.x);
    pose.response.scale.setScalar(1 + pose.hover.z * DISC_3D.hoverScale);
    return !this.reduced.matches && busy;
  }

  beginRotation(id: string) {
    const pose = this.models.get(id);
    if (!pose) return;
    this.dragging = id;
    // 接住当前看到的角度，避免从 hover 切换为拖拽时突然跳一下。
    pose.model.group.quaternion.premultiply(pose.response.quaternion).premultiply(pose.flow.quaternion).normalize();
    pose.flow.quaternion.identity();
    pose.lean = 0;
    pose.hover.x = pose.hover.y = 0;
    pose.hoverVelocity.set(0, 0, 0);
    pose.response.quaternion.identity();
    this.clearHover();
    // 接管正在归位的当前四元数，不回放旧起点，连着拖动也不会跳角度。
    pose.rotation = null;
  }

  rotate(id: string, dx: number, dy: number, clientX: number, clientY: number) {
    const pose = this.models.get(id);
    if (!pose) return;
    const sensitivity = DISC_3D.dragRadiansPerDiameter / this.layout.size;
    const bounds = this.host.getBoundingClientRect();
    const center = pose.mount.position.clone().project(this.camera);
    const centerX = bounds.left + (center.x + 1) * this.width / 2;
    const centerY = bounds.top + (1 - center.y) * this.height / 2;
    const radialX = (clientX - centerX) / this.layout.size;
    const radialY = (clientY - centerY) / this.layout.size;
    const delta = new Vector3(dy * sensitivity, dx * sensitivity, (radialY * dx - radialX * dy) * sensitivity * .6);
    this.applyDelta(pose, delta);
    this.wake();
  }

  endRotation() {
    const pose = this.dragging ? this.models.get(this.dragging) : undefined;
    this.dragging = null;
    // 松手或触摸被取消都自动回到陈列姿态，不停留在任意倾斜角度。
    if (pose) this.returnToRest(pose);
  }

  private returnToRest(pose: Pose) {
    this.clearHover();
    pose.rotation = { from: pose.model.group.quaternion.clone(), elapsed: 0 };
    if (this.reduced.matches) this.stepRotation(pose, 0);
    this.wake();
  }

  /** 自动归位只改变盘面姿态，不改光盘的排列位置。 */
  private stepRotation(pose: Pose, dt: number) {
    const rotation = pose.rotation;
    if (!rotation) return false;
    rotation.elapsed += dt;
    const t = this.reduced.matches ? 1 : Math.min(1, rotation.elapsed / DISC_3D.returnDuration);
    const eased = 1 - Math.pow(1 - t, 4);
    pose.model.group.quaternion.slerpQuaternions(rotation.from, BASE_ROTATION, eased);
    if (t === 1) {
      pose.model.group.quaternion.copy(BASE_ROTATION);
      pose.rotation = null;
    }
    return t < 1;
  }

  private applyDelta(pose: Pose, delta: Vector3) {
    const angle = delta.length();
    if (angle < .000001) return;
    const turn = new Quaternion().setFromAxisAngle(delta.clone().normalize(), angle);
    pose.model.group.quaternion.premultiply(turn).normalize();
  }

  step(dt: number, selectedId: string): boolean {
    if (this.lost || !this.width) return false;
    this.updateHoverTarget();
    let busy = this.layoutBusy;
    this.models.forEach((pose, id) => {
      // 已滑出屏幕的光盘也完成归位，切回来时不会带着半途停住的姿态。
      if (this.stepRotation(pose, dt)) busy = true;
      if (!pose.mount.visible) return;
      const flow = GALLERY_MOTION.flow;
      const targetLean = this.reduced.matches || this.dragging === id ? 0
        : -Math.sign(this.flowVelocity) * Math.min(flow.maxLean, Math.sqrt(Math.abs(this.flowVelocity)) * flow.lean);
      pose.lean = this.reduced.matches ? 0 : MathUtils.lerp(pose.lean, targetLean, 1 - Math.exp(-flow.follow * dt / 1000));
      if (Math.abs(pose.lean - targetLean) < GALLERY_MOTION.settleEpsilon) pose.lean = targetLean;
      else busy = true;
      pose.flow.rotation.set(Math.abs(pose.lean) * flow.dip, pose.lean, pose.lean * flow.bank);
      if (this.stepHover(pose, dt)) busy = true;
    });
    const selected = this.models.get(selectedId);
    if (selected) {
      const visibleRotation = selected.model.group.quaternion.clone().premultiply(selected.response.quaternion).premultiply(selected.flow.quaternion);
      const normal = new Vector3(0, 0, 1).applyQuaternion(visibleRotation);
      this.element.dataset.face = normal.z >= 0 ? 'front' : 'back';
      this.element.dataset.orientation = visibleRotation.toArray().map(n => n.toFixed(4)).join(',');
      this.element.dataset.hover = this.hovered ?? '';
      this.element.dataset.hoverOffset = selected.hover.toArray().map(n => n.toFixed(4)).join(',');
      this.element.dataset.flow = selected.lean.toFixed(4);
      this.element.dataset.rotationState = this.dragging === selectedId ? 'dragging' : selected.rotation ? 'return' : 'idle';
    }
    const highlighted = this.hovered ? this.models.get(this.hovered) : null;
    this.scene.updateMatrixWorld(true);
    if (this.reduced.matches || this.dragging) this.highlight.hide();
    else this.highlight.update(highlighted?.mount.visible ? highlighted.model.group : null, performance.now());
    this.renderer.render(this.scene, this.camera);
    return busy;
  }

  get available() { return !this.lost && this.width > 0; }

  /** 提前编译材质并上传正反面贴图，首次入场和第一次翻面都不再临时准备。 */
  async warmup(selectedId: string) {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.lost) throw new Error('图形上下文不可用');
    const textures = new Set<Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => Object.values(material).forEach(value => {
        if (value instanceof Texture) textures.add(value);
      }));
    });
    textures.forEach(texture => this.renderer.initTexture(texture));
    this.step(0, selectedId);
    this.element.dataset.prepared = 'true';
  }

  /** 首次加载直接演出真实主盘；与普通路由转场共享 flight，但不同时占用画布。 */
  beginOpening(selectedId: string): OpeningDriver {
    const selectedIndex = this.projects.findIndex(project => project.id === selectedId);
    const selected = this.models.get(selectedId)!;
    this.pause();
    const layer = document.createElement('div');
    layer.className = 'disc-transition-layer disc-opening-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    layer.append(this.element);
    this.flightLayer = layer;
    this.element.dataset.opening = 'rising';
    const resting = selected.model.group.quaternion.clone();
    const inverseResting = resting.clone().invert();
    const center = new Vector3();
    const rotation = new Quaternion();
    let finished = false;
    const scene = this;
    return {
      get available() { return scene.available; },
      draw: frame => {
        const width = layer.clientWidth, height = layer.clientHeight;
        if (width !== this.width || height !== this.height) {
          this.updateLayout(getGalleryLayout(width, height), this.progress);
        }
        const radius = this.layout.size / 2;
        const c = LOADING.scene;
        const restingY = height / 2 + this.layout.centerY;
        // 留足底部数字和完整盘面的空间，手机地址栏变化时也不会把入场裁掉。
        const floor = height - frame.fontHeight * 1.85 - radius * c.boost;
        const drop = Math.max(0, Math.min(c.drop, (floor - restingY) / radius));
        this.projects.forEach((project, index) => {
          const pose = this.models.get(project.id)!;
          const offset = index - selectedIndex;
          const scale = openingScale(frame, offset);
          pose.flight.scale.setScalar(Math.max(.001, scale));
          if (offset) {
            pose.flight.position.set(0, 0, 0);
            pose.flight.rotation.set(0, -Math.PI / 2 * (1 - scale), 0);
            pose.mount.visible = scale > 0 && Math.abs(offset) < this.layout.visibleRange;
          } else {
            pose.mount.visible = true;
            pose.flight.position.set(0, -drop * (1 - frame.rise), -c.depth * (1 - frame.rise));
            rotation.setFromEuler(new Euler(0, -Math.PI / 2, c.roll * (1 - frame.turn)));
            rotation.slerp(resting, frame.turn);
            pose.flight.quaternion.copy(rotation).multiply(inverseResting);
          }
        });
        this.scene.updateMatrixWorld(true);
        this.camera.updateMatrixWorld();
        selected.flight.getWorldPosition(center);
        const distance = this.camera.position.z - center.z;
        const projectedRadius = selected.mount.scale.x * selected.flight.scale.x * this.camera.position.z / distance;
        center.project(this.camera);
        if (!this.lost) this.renderer.render(this.scene, this.camera);
        this.element.dataset.opening = frame.fan < 0 ? 'rising' : 'fan';
        this.element.dataset.openingScale = selected.flight.scale.x.toFixed(4);
        return { x: (center.x + 1) * width / 2, y: (1 - center.y) * height / 2, radius: projectedRadius };
      },
      finish: () => {
        if (finished) return;
        finished = true;
        this.models.forEach(pose => {
          pose.flight.scale.setScalar(1);
          pose.flight.quaternion.identity();
          pose.flight.position.set(0, 0, 0);
        });
        this.host.append(this.element);
        layer.remove();
        this.flightLayer = null;
        delete this.element.dataset.opening;
        delete this.element.dataset.openingScale;
        this.updateLayout(this.layout, this.progress);
        this.step(0, selectedId);
      },
    };
  }

  /** 复用原画布跨页演出；临时变换只写 flight，结束或取消后统一清理。 */
  async transition(direction: DiscTransitionDirection, selectedId: string, commit: () => void, signal: AbortSignal) {
    const selectedIndex = this.projects.findIndex(project => project.id === selectedId);
    if (!this.available || selectedIndex < 0) { commit(); return; }
    const layer = document.createElement('div');
    layer.className = 'disc-transition-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    layer.append(this.element);
    this.flightLayer = layer;
    this.highlight.hide();
    this.element.dataset.transition = direction;
    // 转场期间暂停自动归位，保留点击瞬间的姿态；回到画廊后继续完成。
    const turns = new Map<string, Quaternion>();
    this.models.forEach((pose, id) => {
      const visible = pose.model.group.quaternion.clone().premultiply(pose.response.quaternion).premultiply(pose.flow.quaternion);
      const side = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
      turns.set(id, side.multiply(visible.invert()));
    });
    const c = DISC_TRANSITION;
    const duration = direction === 'exit' ? c.exitDelay + c.exitDuration
      : Math.max(c.enterDuration, c.enterNeighborDuration + c.enterStagger * 3);
    try {
      await runDiscTimeline({
        duration, handover: direction === 'exit' ? c.handover : 0, signal, commit,
        canAnimate: () => this.available,
        draw: time => {
          if (this.lost) return;
          // 详情出现后舞台会隐藏，窗口尺寸仍从临时全屏容器读取。
          const width = layer.clientWidth, height = layer.clientHeight;
          if (width !== this.width || height !== this.height) this.updateLayout(getGalleryLayout(width, height), this.progress);
          this.projects.forEach((project, index) => {
            const pose = this.models.get(project.id)!;
            const offset = index - selectedIndex;
            const state = sampleDiscTransition(direction, time, offset);
            pose.flight.scale.setScalar(state.scale);
            pose.flight.quaternion.identity().slerp(turns.get(project.id)!, state.turn);
            pose.flight.position.set(
              Math.sign(offset) * state.retreat * .65,
              Math.sign(offset) * state.retreat * .2,
              offset ? -state.retreat * .12 : 0,
            );
            if (!offset) this.element.dataset.transitionScale = state.scale.toFixed(4);
          });
          this.renderer.render(this.scene, this.camera);
        },
      });
    } finally {
      this.models.forEach(pose => {
        pose.flight.scale.setScalar(1);
        pose.flight.quaternion.identity();
        pose.flight.position.set(0, 0, 0);
      });
      this.host.append(this.element);
      layer.remove();
      this.flightLayer = null;
      delete this.element.dataset.transition;
      delete this.element.dataset.transitionScale;
    }
  }

  pause() {
    this.dragging = null;
    this.clearHover();
    this.highlight.hide();
    this.models.forEach(pose => {
      pose.lean = 0;
      pose.flow.quaternion.identity();
      pose.hover.set(0, 0, 0);
      pose.hoverVelocity.set(0, 0, 0);
      pose.response.quaternion.identity();
      pose.response.position.z = 0;
      pose.response.scale.setScalar(1);
    });
  }

  dispose() {
    this.highlight.dispose();
    this.models.forEach(pose => pose.model.dispose());
    this.environment.dispose();
    this.renderer.dispose();
    this.element.remove();
  }
}
