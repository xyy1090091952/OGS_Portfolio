import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, Euler, Group, MathUtils, PerspectiveCamera,
  Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createDiscModel, type DiscModel } from './disc-model';
import { DISC_3D } from './disc-config';
import { createDiscEnvironment } from './disc-materials';
import { DiscHighlight } from './disc-highlight';
import { getDiscPlacement, getGalleryLayout, type GalleryLayout } from './disc-layout';
import { GALLERY_LAYOUT, GALLERY_MOTION } from './gallery-config';
import { PROJECTS, type Project } from './data';

interface Pose {
  model: DiscModel;
  mount: Group;
  flow: Group;
  lean: number;
  followProgress: number;
  response: Group;
  hover: Vector3;
  hoverTarget: Vector3;
  hoverVelocity: Vector3;
  perspectiveScale: number;
  velocity: Vector3;
  from: Quaternion;
  target: Quaternion | null;
  elapsed: number;
}

const BASE_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 6, -Math.PI / 6, 0));
const Y_AXIS = new Vector3(0, 1, 0);

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
    this.renderer.toneMappingExposure = 1.05;
    this.element = this.renderer.domElement;
    this.element.className = 'disc-webgl-canvas';
    // 显隐交由页面样式控制，避免 Three.js 默认的内联 display 覆盖回退状态。
    this.element.style.removeProperty('display');
    this.element.setAttribute('aria-hidden', 'true');
    this.environment = createDiscEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.highlight = new DiscHighlight(this.wake);
    this.scene.add(this.highlight.group);
    this.scene.add(new AmbientLight('#ffffff', .45));
    const key = new DirectionalLight('#ffffff', 1.4);
    key.position.set(-500, 700, 1500);
    this.scene.add(key);
    const fill = new DirectionalLight('#e2eeff', .6);
    fill.position.set(900, -400, 400);
    this.scene.add(fill);
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
        const model = createDiscModel(project, PROJECTS.indexOf(project), this.wake);
        const mount = new Group();
        // 陈列位置 > 运动倾斜 > 悬停反馈 > 手动旋转，临时效果不会累积到手动姿态。
        const flow = new Group();
        const response = new Group();
        response.add(model.group);
        flow.add(response);
        mount.add(flow);
        this.scene.add(mount);
        model.group.quaternion.copy(BASE_ROTATION);
        this.models.set(project.id, {
          model, mount, flow, lean: 0, followProgress: this.progress,
          response, hover: new Vector3(), hoverTarget: new Vector3(), hoverVelocity: new Vector3(),
          perspectiveScale: 1,
          velocity: new Vector3(), from: new Quaternion(), target: null, elapsed: 0,
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
    const width = this.host.clientWidth, height = this.host.clientHeight;
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
    pose.target = null;
    pose.velocity.set(0, 0, 0);
  }

  rotate(id: string, dx: number, dy: number, clientX: number, clientY: number, elapsed: number) {
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
    // 记录角速度而非最后一个像素位移，避免高刷新率与低刷新率设备手感不同。
    pose.velocity.copy(delta).multiplyScalar(16.67 / Math.max(8, elapsed)).clampLength(0, DISC_3D.maxAngularSpeed);
    this.wake();
  }

  endRotation(cancel = false) {
    if (this.dragging && (cancel || this.reduced.matches)) this.models.get(this.dragging)?.velocity.set(0, 0, 0);
    this.dragging = null;
    this.wake();
  }

  flip(id: string) {
    const pose = this.models.get(id);
    if (!pose) return;
    const target = pose.model.group.quaternion.clone().premultiply(new Quaternion().setFromAxisAngle(Y_AXIS, Math.PI));
    this.animateTo(pose, target);
  }

  reset(id: string) {
    const pose = this.models.get(id);
    if (pose) this.animateTo(pose, BASE_ROTATION);
  }

  private animateTo(pose: Pose, target: Quaternion) {
    this.clearHover();
    pose.velocity.set(0, 0, 0);
    pose.from.copy(pose.model.group.quaternion);
    pose.target = target.clone();
    pose.elapsed = 0;
    this.wake();
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
      if (!pose.mount.visible) return;
      const flow = GALLERY_MOTION.flow;
      const targetLean = this.reduced.matches || this.dragging === id ? 0
        : -Math.sign(this.flowVelocity) * Math.min(flow.maxLean, Math.sqrt(Math.abs(this.flowVelocity)) * flow.lean);
      pose.lean = this.reduced.matches ? 0 : MathUtils.lerp(pose.lean, targetLean, 1 - Math.exp(-flow.follow * dt / 1000));
      if (Math.abs(pose.lean - targetLean) < GALLERY_MOTION.settleEpsilon) pose.lean = targetLean;
      else busy = true;
      pose.flow.rotation.set(Math.abs(pose.lean) * flow.dip, pose.lean, pose.lean * flow.bank);
      if (this.stepHover(pose, dt)) busy = true;
      if (pose.target) {
        pose.elapsed += dt;
        const t = this.reduced.matches ? 1 : Math.min(1, pose.elapsed / DISC_3D.flipDuration);
        const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        pose.model.group.quaternion.slerpQuaternions(pose.from, pose.target, eased);
        if (t === 1) pose.target = null;
        else busy = true;
      } else if (id !== this.dragging && pose.velocity.lengthSq() > .0000005) {
        if (this.reduced.matches) pose.velocity.set(0, 0, 0);
        else {
          this.applyDelta(pose, pose.velocity.clone().multiplyScalar(dt / 16.67));
          pose.velocity.multiplyScalar(Math.pow(DISC_3D.inertiaDecay, dt / 16.67));
          busy = true;
        }
      }
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
    }
    const highlighted = this.hovered ? this.models.get(this.hovered) : null;
    this.scene.updateMatrixWorld(true);
    if (this.reduced.matches || this.dragging) this.highlight.hide();
    else this.highlight.update(highlighted?.mount.visible ? highlighted.model.group : null, performance.now());
    this.renderer.render(this.scene, this.camera);
    return busy;
  }

  pause() {
    this.dragging = null;
    this.clearHover();
    this.highlight.hide();
    this.models.forEach(pose => {
      pose.velocity.set(0, 0, 0);
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
