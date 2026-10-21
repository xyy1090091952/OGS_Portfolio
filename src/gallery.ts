import { PROJECTS, type Category, type Project } from './data';
import { discMarkup } from './disc';
import type { DiscScene } from './disc-scene';
import { GALLERY_MOTION as MOTION } from './gallery-config';
import { GalleryMotion, WheelGesture, type MotionSource } from './gallery-motion';
import { getGalleryLayout, getDiscScreenPlacement } from './disc-layout';
import type { DiscTransitionDirection } from './disc-transition';
import { LOADING, withDeadline, type LoadingReporter } from './loading-config';
import type { OpeningDriver } from './disc-opening';
import { GalleryCaption } from './gallery-caption';

/** 光盘状态只有一份。滚轮、触摸、键盘、索引均改变 target，再由同一动画循环渲染。 */
export class DiscGallery {
  private projects = [...PROJECTS];
  private active = -1;
  private motion = new GalleryMotion();
  private wheel = new WheelGesture();
  private frame = 0;
  private lastTime = 0;
  private enabled = false;
  private transitioning = false;
  private preparation: Promise<void> | null = null;
  private pointer: {
    id: number; x: number; y: number; progress: number; moved: boolean;
    lastX: number; lastY: number; lastTime: number; rotationId: string | null;
    touch: boolean; mode: 'pending' | 'rotate' | 'browse-x' | 'browse-y'; velocity: number;
  } | null = null;
  private suppressClick = false;
  private stage: HTMLElement;
  private discs: HTMLElement[] = [];
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private scene: DiscScene | null = null;
  private caption: GalleryCaption;

  constructor(
    private root: HTMLElement,
    private onOpen: (project: Project) => void,
    private onChange: (project: Project) => void,
  ) {
    this.stage = root.querySelector('.disc-stage')!;
    this.caption = new GalleryCaption(root);
    this.render();
    root.querySelector('[data-prev]')!.addEventListener('click', () => this.step(-1));
    root.querySelector('[data-next]')!.addEventListener('click', () => this.step(1));
    root.querySelector('[data-explore]')!.addEventListener('click', () => { if (this.enabled) this.onOpen(this.selected); });

    this.stage.addEventListener('click', event => {
      if (!this.enabled) return;
      if (this.suppressClick) { this.suppressClick = false; return; }
      const disc = (event.target as Element).closest<HTMLElement>('[data-project]');
      const id = disc?.dataset.project ?? this.scene?.hitTest(event.clientX, event.clientY);
      const index = this.projects.findIndex(project => project.id === id);
      if (index < 0) return;
      if (index === this.active) this.onOpen(this.selected);
      else this.goTo(index);
    });
    root.addEventListener('keydown', event => {
      if (!this.enabled || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter' && event.target === this.stage) {
        event.preventDefault();
        this.onOpen(this.selected);
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Home') this.goTo(0, false, 'key');
        else if (event.key === 'End') this.goTo(this.projects.length - 1, false, 'key');
        else this.step(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1, 'key');
        // 跳转目标可能仍在屏幕外；焦点留在舞台，避免隐藏按钮让后续方向键失效。
        this.stage.focus({ preventScroll: true });
      }
    });

    // 首页是全屏浏览器：两个方向的滚轮都映射到光盘进度；详情页恢复正常滚动。
    root.addEventListener('wheel', event => {
      if (!this.enabled || event.ctrlKey || this.pointer) return;
      event.preventDefault();
      if (this.projects.length < 2) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const direction = this.wheel.consume(delta * unit, performance.now());
      if (direction) this.step(direction, 'wheel');
    }, { passive: false });

    this.stage.addEventListener('pointerdown', event => {
      if (!this.enabled || event.button !== 0 || this.pointer) return;
      this.wheel.reset();
      const rotationId = this.scene?.hitTest(event.clientX, event.clientY) ?? null;
      this.pointer = {
        id: event.pointerId, x: event.clientX, y: event.clientY, progress: this.motion.current, moved: false,
        lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), rotationId,
        touch: event.pointerType !== 'mouse', mode: 'pending', velocity: 0,
      };
      this.suppressClick = false;
    });
    this.stage.addEventListener('pointermove', event => {
      if (!this.enabled) return;
      const pointer = this.pointer;
      // 触屏只响应真实拖拽，不模拟无法移开的 hover。
      if (!pointer && event.pointerType === 'mouse') this.scene?.hoverAt(event.clientX, event.clientY);
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) < MOTION.dragThreshold && !pointer.moved) return;
      if (!pointer.moved) {
        pointer.moved = true;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        // 触摸先判方向：横滑浏览，盘面纵拖旋转；鼠标在盘面仍可自由旋转。
        pointer.mode = pointer.rotationId && (!pointer.touch || !horizontal)
          ? 'rotate' : horizontal ? 'browse-x' : 'browse-y';
        pointer.progress = this.motion.current;
        this.motion.hold();
        if (pointer.mode === 'rotate') this.scene?.beginRotation(pointer.rotationId!);
        else this.scene?.clearHover();
        this.stage.setPointerCapture(event.pointerId);
        this.stage.classList.add('is-dragging');
      }
      const now = performance.now();
      const elapsed = Math.max(8, now - pointer.lastTime);
      if (pointer.mode === 'rotate') {
        this.scene?.rotate(pointer.rotationId!, event.clientX - pointer.lastX, event.clientY - pointer.lastY, event.clientX, event.clientY);
      } else {
        const { spacing } = this.geometry();
        const distance = pointer.mode === 'browse-x' ? -dx : dy;
        const previous = this.motion.target;
        this.motion.dragTo(pointer.progress + distance / spacing, this.projects.length, this.reducedMotion.matches);
        const velocity = (this.motion.target - previous) * 1000 / elapsed;
        pointer.velocity = pointer.velocity * .35 + velocity * .65;
      }
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastTime = now;
      this.updateControls();
      this.requestFrame();
    });
    this.stage.addEventListener('pointerup', event => this.endDrag(event));
    this.stage.addEventListener('pointercancel', event => this.endDrag(event, true));
    this.stage.addEventListener('pointerleave', () => this.scene?.clearHover());
    window.addEventListener('blur', () => {
      this.cancelPointer();
      if (!this.transitioning) this.scene?.pause();
      this.wheel.reset();
    });
    this.stage.addEventListener('lostpointercapture', event => {
      // 触摸起点的子元素会先失去隐式捕获；转交给舞台时不能误判为拖动结束。
      if (event.target === this.stage) this.endDrag(event, true);
    });
    window.addEventListener('pointerup', event => this.endDrag(event));
    window.addEventListener('resize', () => {
      this.cancelPointer();
      if (this.transitioning) return;
      this.position();
      this.requestFrame();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancelPointer();
        if (!this.transitioning) this.scene?.pause();
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else if (this.enabled) this.requestFrame();
    });
    this.reducedMotion.addEventListener('change', () => this.requestFrame());
  }

  prepare(assetsReady: Promise<void>, report: LoadingReporter) {
    return this.preparation ??= this.initializeScene(assetsReady, report);
  }

  private async initializeScene(assetsReady: Promise<void>, report: LoadingReporter) {
    try {
      // 3D 模块与资源并行下载，字体和封面准备完成后才绘制盘面。
      const moduleReady = withDeadline(import('./disc-scene'), LOADING.sceneTimeout).then(module => {
        report('module');
        return module;
      });
      const [{ DiscScene }] = await Promise.all([moduleReady, assetsReady]);
      this.render();
      const scene = new DiscScene(this.stage, () => this.requestFrame(), available => {
        this.root.classList.toggle('has-webgl', available);
        this.requestFrame();
      });
      this.scene = scene;
      scene.setProjects(this.projects);
      this.root.classList.add('has-webgl');
      this.position();
      report('models');
      await withDeadline(scene.warmup(this.selected.id), LOADING.sceneTimeout);
      report('render');
    } catch (error) {
      console.warn('三维光盘不可用，已启用 CSS 展示', error);
      this.scene?.dispose();
      this.scene = null;
      this.root.classList.remove('has-webgl');
      await assetsReady;
      this.render();
      // 回退展示也属于完成准备，不让不支持 WebGL 的设备停在 Loading。
      report('module');
      report('models');
      report('render');
    }
  }

  get selected() { return this.projects[Math.max(0, this.active)]; }
  get visibleProjects() { return this.projects; }

  setEnabled(enabled: boolean) {
    if (this.transitioning) return;
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.cancelPointer();
      this.wheel.reset();
      this.scene?.pause();
      this.stage.classList.remove('is-dragging');
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.motion.jump(Math.max(0, this.active));
      this.updateControls();
      this.position();
      this.scene?.step(0, this.selected.id);
    } else {
      this.position();
      this.requestFrame();
    }
  }

  /** 入场期间暂停常规渲染，由 Loading 时间轴独占画布，结束时恢复陈列。 */
  beginOpening(): OpeningDriver | null {
    if (!this.scene?.available || this.reducedMotion.matches || document.hidden) return null;
    this.enabled = false;
    this.transitioning = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.prepareReturn();
    const driver = this.scene.beginOpening(this.selected.id);
    return {
      get available() { return driver.available; },
      draw: frame => driver.draw(frame),
      finish: () => {
        try { driver.finish(); }
        finally {
          this.transitioning = false;
          this.position();
        }
      },
    };
  }

  /** 路由只负责何时换页；光盘动画、输入冻结和清理都由画廊自己管理。 */
  async transition(direction: DiscTransitionDirection, commit: () => void, signal: AbortSignal) {
    if (!this.scene?.available || this.reducedMotion.matches || document.hidden) { commit(); return; }
    this.enabled = false;
    this.transitioning = true;
    this.cancelPointer();
    this.wheel.reset();
    this.motion.hold();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.root.inert = true;
    this.root.classList.add(direction === 'exit' ? 'is-departing' : 'is-arriving');
    if (direction === 'exit') this.caption.leave();
    else this.caption.enter();
    try {
      await this.scene.transition(direction, this.selected.id, commit, signal);
    } finally {
      this.transitioning = false;
      this.root.inert = false;
      this.root.classList.remove('is-departing', 'is-arriving');
      this.caption.settle();
      // 页面已隐藏后再清除悬停，不影响用户看到的离场姿态。
      if (this.root.hidden) this.scene.pause();
      else if (signal.aborted) this.motion.goTo(this.active, this.projects.length, 'snap');
    }
  }

  prepareReturn() {
    this.motion.jump(Math.max(0, this.active));
    this.updateControls();
    this.position();
    this.scene?.step(0, this.selected.id);
  }

  setFilter(category: Category) {
    this.cancelPointer();
    this.wheel.reset();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const selectedId = this.selected?.id;
    this.scene?.pause();
    this.projects = category === 'all' ? [...PROJECTS] : PROJECTS.filter(project => project.category === category);
    this.motion.jump(Math.max(0, this.projects.findIndex(project => project.id === selectedId)));
    this.active = -1;
    this.render();
    this.scene?.step(0, this.selected.id);
    this.requestFrame();
  }

  selectProject(id: string, instant = false) {
    const index = this.projects.findIndex(project => project.id === id);
    if (index < 0) return;
    this.goTo(index, instant);
  }

  private endDrag(event: PointerEvent, cancel = false) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.finishPointer(cancel);
  }

  private cancelPointer() {
    if (this.pointer) this.finishPointer(true);
  }

  private finishPointer(cancel: boolean) {
    const pointer = this.pointer!;
    this.pointer = null;
    this.suppressClick = pointer.moved;
    this.stage.classList.remove('is-dragging');
    if (this.stage.hasPointerCapture(pointer.id)) this.stage.releasePointerCapture(pointer.id);
    const stale = performance.now() - pointer.lastTime > MOTION.stalePointer;
    if (pointer.mode === 'rotate') {
      this.scene?.endRotation();
      this.goTo(Math.round(this.motion.current), false, 'snap');
    } else if (pointer.moved) {
      this.motion.release(stale ? 0 : pointer.velocity, this.projects.length, this.reducedMotion.matches, cancel);
      this.updateControls();
      this.requestFrame();
    }
  }

  private step(direction: number, source: MotionSource = 'click') {
    if (!this.enabled) return;
    this.motion.stepBy(direction, this.projects.length, source, this.reducedMotion.matches);
    this.updateControls();
    this.requestFrame();
  }

  private goTo(index: number, instant = false, source: MotionSource = 'click') {
    this.motion.goTo(index, this.projects.length, source, instant || this.reducedMotion.matches);
    if (instant || this.reducedMotion.matches) {
      this.updateMetadata(Math.round(this.motion.current), true);
      this.position();
    }
    this.updateControls();
    this.requestFrame();
  }

  private requestFrame() {
    if (this.frame || !this.enabled || document.hidden) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(time => this.animate(time));
  }

  private animate(time: number) {
    this.frame = 0;
    const dt = Math.min(50, Math.max(1, time - this.lastTime));
    this.lastTime = time;
    const moving = this.motion.tick(time, dt, this.reducedMotion.matches);
    // 资料随眼前的光盘跨过中点再切换，避免标题先到、光盘还没到。
    this.updateMetadata(Math.round(this.motion.current));
    this.position(dt);
    const rotating = this.scene?.step(dt, this.selected.id) ?? false;
    if (moving || rotating) this.frame = requestAnimationFrame(next => this.animate(next));
  }

  private geometry() {
    return getGalleryLayout(this.root.clientWidth || innerWidth, this.root.clientHeight || innerHeight);
  }

  private position(dt = 0) {
    const layout = this.geometry();
    const { size, centerX, centerY, mode } = layout;
    const { current, target, velocity } = this.motion;
    this.root.dataset.layout = mode;
    this.root.dataset.progress = current.toFixed(4);
    this.root.dataset.target = target.toFixed(4);
    const ctaX = centerX + (mode === 'desktop' ? size * .52 : 0);
    this.root.style.setProperty('--gallery-cta-x', `calc(50% + ${ctaX}px)`);
    const ctaOffset = mode === 'desktop' ? size * .4 + 8 : size * .43 + (mode === 'landscape' ? 8 : 18);
    this.root.style.setProperty('--gallery-cta-y', `calc(50% + ${centerY + ctaOffset}px)`);
    this.stage.style.setProperty('--disc-size', `${size}px`);
    this.scene?.updateLayout(layout, current, velocity, dt);
    this.discs.forEach((disc, index) => {
      const offset = index - current;
      const { x, y, scale } = getDiscScreenPlacement(layout, offset);
      disc.style.setProperty('--x', `${x}px`);
      disc.style.setProperty('--y', `${y}px`);
      disc.style.setProperty('--scale', String(scale));
      disc.style.setProperty('--yaw', `${-31 + offset * 2}deg`);
      disc.style.setProperty('--roll', `${-24 + offset * 2 - velocity * 1.2}deg`);
      disc.style.setProperty('--shine', `${offset * 15}deg`);
      // CSS 回退与三维场景一致：左下方较早的光盘遮住右上方后续光盘。
      disc.style.zIndex = String(20 + this.projects.length - index);
      const offscreen = Math.abs(offset) >= layout.visibleRange;
      // 屏内光盘继承页面显隐；显式 visible 会越过 Loading 的父级 hidden，导致首帧闪盘。
      disc.style.visibility = offscreen ? 'hidden' : '';
      disc.setAttribute('aria-hidden', String(offscreen));
    });
  }

  private updateControls() {
    // 按钮边界看目的地；作品资料看实际位置，快速连点时二者各司其职。
    const index = Math.round(this.motion.target);
    this.root.dataset.target = this.motion.target.toFixed(4);
    this.root.querySelector<HTMLButtonElement>('[data-prev]')!.disabled = index === 0;
    this.root.querySelector<HTMLButtonElement>('[data-next]')!.disabled = index === this.projects.length - 1;
  }

  private updateMetadata(index: number, instant = false) {
    if (index === this.active) {
      if (instant) this.caption.show(this.selected, true);
      return;
    }
    this.active = index;
    const project = this.selected;
    this.caption.show(project, instant);
    // 无障碍播报只更新一次，不跟随临时文字遮罩反复读出同一内容。
    this.root.querySelector('[data-project-announcement]')!.textContent = `${project.title}，${project.year}，${project.label}`;
    this.root.querySelector('[data-counter]')!.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.projects.length).padStart(2, '0')}`;
    this.discs.forEach((disc, i) => {
      disc.classList.toggle('is-active', i === index);
      disc.setAttribute('aria-current', String(i === index));
      disc.tabIndex = i === index ? 0 : -1;
    });
    this.onChange(project);
  }

  private render() {
    this.stage.innerHTML = this.projects.map(project => discMarkup(project, PROJECTS.indexOf(project))).join('');
    this.discs = [...this.stage.querySelectorAll<HTMLElement>('.disc')];
    this.scene?.setProjects(this.projects);
    this.position();
    // 预加载会重建按钮；即使作品没换，也要重新同步选中样式和键盘焦点入口。
    this.active = -1;
    this.updateMetadata(Math.round(this.motion.current), true);
    this.updateControls();
  }
}
