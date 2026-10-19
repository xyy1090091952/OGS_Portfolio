import {
  AmbientLight, DirectionalLight, Euler, Group, MathUtils, PerspectiveCamera,
  PMREMGenerator, Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDiscModel, DISC_3D, type DiscModel } from './disc-model';
import { PROJECTS, type Project } from './data';

interface Pose {
  model: DiscModel;
  mount: Group;
  velocity: Vector3;
  from: Quaternion;
  target: Quaternion | null;
  elapsed: number;
}

export interface GalleryLayout {
  size: number;
  spacing: number;
  slope: number;
  mobile: boolean;
}

const BASE_ROTATION = new Quaternion().setFromEuler(new Euler(.07, -.54, -.42, 'ZYX'));
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
  private layout: GalleryLayout = { size: 600, spacing: 500, slope: -.46, mobile: false };
  private progress = 0;
  private width = 0;
  private height = 0;
  private dragging: string | null = null;
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
    this.element = this.renderer.domElement;
    this.element.className = 'disc-webgl-canvas';
    // 显隐交由页面样式控制，避免 Three.js 默认的内联 display 覆盖回退状态。
    this.element.style.removeProperty('display');
    this.element.setAttribute('aria-hidden', 'true');
    this.environment = this.makeEnvironment();
    this.scene.environment = this.environment.texture;
    this.scene.add(new AmbientLight('#ffffff', .7));
    const key = new DirectionalLight('#ffffff', 1.8);
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
      this.environment = this.makeEnvironment();
      this.scene.environment = this.environment.texture;
      this.lost = false;
      this.availability(true);
      this.wake();
    });
  }

  private makeEnvironment() {
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(this.renderer);
    const map = generator.fromScene(room, .04);
    room.dispose();
    generator.dispose();
    return map;
  }

  setProjects(projects: Project[]) {
    this.projects = projects;
    this.models.forEach(pose => { pose.mount.visible = false; });
    projects.forEach(project => {
      if (!this.models.has(project.id)) {
        const model = createDiscModel(project, PROJECTS.indexOf(project), this.wake);
        const mount = new Group();
        mount.add(model.group);
        this.scene.add(mount);
        model.group.quaternion.copy(BASE_ROTATION);
        this.models.set(project.id, {
          model, mount, velocity: new Vector3(), from: new Quaternion(), target: null, elapsed: 0,
        });
      }
      this.models.get(project.id)!.mount.visible = true;
    });
    this.host.append(this.element);
  }

  updateLayout(layout: GalleryLayout, progress: number) {
    this.layout = layout;
    this.progress = progress;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height || this.lost) return;
    if (this.width !== width || this.height !== height) {
      this.width = width; this.height = height;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.position.z = height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)));
      this.camera.updateProjectionMatrix();
    }
    this.projects.forEach((project, index) => {
      const pose = this.models.get(project.id)!;
      const offset = index - progress;
      pose.mount.visible = Math.abs(offset) < (layout.mobile ? 1.7 : 2.5);
      const size = layout.size * MathUtils.clamp(1 + offset * .07, .65, 1.25);
      pose.mount.scale.setScalar(size / 2);
      pose.mount.position.set(offset * layout.spacing, -offset * layout.spacing * layout.slope - (layout.mobile ? height * .03 : 0), 0);
    });
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

  beginRotation(id: string) {
    const pose = this.models.get(id);
    if (!pose) return;
    this.dragging = id;
    pose.target = null;
    pose.velocity.set(0, 0, 0);
  }

  rotate(id: string, dx: number, dy: number, clientX: number, clientY: number, elapsed: number) {
    const pose = this.models.get(id);
    if (!pose) return;
    const sensitivity = DISC_3D.dragRadiansPerDiameter / this.layout.size;
    const index = this.projects.findIndex(project => project.id === id);
    const centerX = this.width / 2 + (index - this.progress) * this.layout.spacing;
    const centerY = this.height * (this.layout.mobile ? .53 : .5) + (index - this.progress) * this.layout.spacing * this.layout.slope;
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
    let busy = false;
    this.models.forEach((pose, id) => {
      if (!pose.mount.visible) return;
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
      const normal = new Vector3(0, 0, 1).applyQuaternion(selected.model.group.quaternion);
      this.element.dataset.face = normal.z >= 0 ? 'front' : 'back';
      this.element.dataset.orientation = selected.model.group.quaternion.toArray().map(n => n.toFixed(4)).join(',');
    }
    this.renderer.render(this.scene, this.camera);
    return busy;
  }

  pause() {
    this.dragging = null;
    this.models.forEach(pose => { pose.velocity.set(0, 0, 0); });
  }

  dispose() {
    this.models.forEach(pose => pose.model.dispose());
    this.environment.dispose();
    this.renderer.dispose();
    this.element.remove();
  }
}
