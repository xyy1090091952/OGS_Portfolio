import { MOTION, PROJECTS, type Category, type Project } from './data';
import { discMarkup } from './disc';
import type { DiscScene } from './disc-scene';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 光盘状态只有一份。滚轮、触摸、键盘、索引均改变 target，再由同一动画循环渲染。 */
export class DiscGallery {
  private projects = [...PROJECTS];
  private active = -1;
  private current = 0;
  private target = 0;
  private frame = 0;
  private lastTime = 0;
  private snapTimer = 0;
  private enabled = true;
  private pointer: {
    id: number; x: number; y: number; progress: number; moved: boolean;
    lastX: number; lastY: number; lastTime: number; rotationId: string | null;
  } | null = null;
  private suppressClick = false;
  private stage: HTMLElement;
  private discs: HTMLElement[] = [];
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private scene: DiscScene | null = null;

  constructor(
    private root: HTMLElement,
    private onOpen: (project: Project) => void,
    private onChange: (project: Project) => void,
  ) {
    this.stage = root.querySelector('.disc-stage')!;
    this.render();
    root.querySelector('[data-prev]')!.addEventListener('click', () => this.step(-1));
    root.querySelector('[data-next]')!.addEventListener('click', () => this.step(1));
    root.querySelector('[data-explore]')!.addEventListener('click', () => this.onOpen(this.selected));
    root.querySelector('[data-flip]')!.addEventListener('click', () => this.scene?.flip(this.selected.id));
    root.querySelector('[data-reset]')!.addEventListener('click', () => this.scene?.reset(this.selected.id));

    this.stage.addEventListener('click', event => {
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
      if (event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (event.key.toLowerCase() === 'f') this.scene?.flip(this.selected.id);
        else this.scene?.reset(this.selected.id);
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Home') this.goTo(0);
        else if (event.key === 'End') this.goTo(this.projects.length - 1);
        else this.step(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
        this.discs[this.active]?.focus({ preventScroll: true });
      }
    });

    // 首页是全屏浏览器：两个方向的滚轮都映射到光盘进度；详情页恢复正常滚动。
    root.addEventListener('wheel', event => {
      if (!this.enabled || event.ctrlKey) return;
      event.preventDefault();
      if (this.projects.length < 2) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.target = clamp(this.target + delta * unit / MOTION.wheelPixelsPerDisc, 0, this.projects.length - 1);
      this.requestFrame();
      clearTimeout(this.snapTimer);
      this.snapTimer = window.setTimeout(() => this.goTo(Math.round(this.target)), MOTION.wheelSnapDelay);
    }, { passive: false });

    this.stage.addEventListener('pointerdown', event => {
      if (!this.enabled || event.button !== 0 || this.pointer) return;
      clearTimeout(this.snapTimer);
      const rotationId = this.scene?.hitTest(event.clientX, event.clientY) ?? null;
      this.pointer = {
        id: event.pointerId, x: event.clientX, y: event.clientY, progress: this.current, moved: false,
        lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), rotationId,
      };
      if (rotationId) this.scene?.beginRotation(rotationId);
      this.target = this.current;
      this.suppressClick = false;
    });
    this.stage.addEventListener('pointermove', event => {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) < MOTION.dragThreshold && !pointer.moved) return;
      if (!pointer.moved) {
        pointer.moved = true;
        this.stage.setPointerCapture(event.pointerId);
        this.stage.classList.add('is-dragging');
      }
      if (pointer.rotationId) {
        const now = performance.now();
        this.scene?.rotate(pointer.rotationId, event.clientX - pointer.lastX, event.clientY - pointer.lastY, event.clientX, event.clientY, now - pointer.lastTime);
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        pointer.lastTime = now;
        return;
      }
      const { spacing, slope } = this.geometry();
      // 拖拽沿光盘的斜线投影，横向、竖向操作均能自然推动队列。
      const distance = Math.abs(dx) > Math.abs(dy) * .5 ? dx - dy * .3 : dy;
      const direction = Math.abs(dx) > Math.abs(dy) * .5 ? -1 : 1;
      this.target = clamp(pointer.progress + direction * distance / (spacing * (1 + Math.abs(slope) * .1)), 0, this.projects.length - 1);
      this.requestFrame();
    });
    this.stage.addEventListener('pointerup', event => this.endDrag(event));
    this.stage.addEventListener('pointercancel', event => this.endDrag(event, true));
    this.stage.addEventListener('lostpointercapture', event => {
      // 触摸起点的子元素会先失去隐式捕获；转交给舞台时不能误判为拖动结束。
      if (event.target === this.stage) this.endDrag(event, true);
    });
    window.addEventListener('pointerup', event => this.endDrag(event));
    window.addEventListener('resize', () => this.requestFrame());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else if (this.enabled) this.requestFrame();
    });
    this.reducedMotion.addEventListener('change', () => this.requestFrame());
    void this.initializeScene();
  }

  private async initializeScene() {
    try {
      // 独立加载 3D 模块：页面和可访问操作先可用，WebGL 不可用时保留原有陈列。
      const { DiscScene } = await import('./disc-scene');
      const scene = new DiscScene(this.stage, () => this.requestFrame(), available => {
        this.root.classList.toggle('has-webgl', available);
        this.root.querySelector<HTMLElement>('.disc-tools')!.hidden = !available;
        this.requestFrame();
      });
      this.scene = scene;
      scene.setProjects(this.projects);
      this.root.classList.add('has-webgl');
      this.root.querySelector<HTMLElement>('.disc-tools')!.hidden = false;
      this.position();
      this.requestFrame();
    } catch {
      this.scene?.dispose();
      this.scene = null;
      this.root.classList.remove('has-webgl');
      this.root.querySelector<HTMLElement>('.disc-tools')!.hidden = true;
    }
  }

  get selected() { return this.projects[Math.max(0, this.active)]; }
  get visibleProjects() { return this.projects; }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      clearTimeout(this.snapTimer);
      this.pointer = null;
      this.scene?.pause();
      this.stage.classList.remove('is-dragging');
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.current = this.target = Math.max(0, this.active);
      this.position();
      this.scene?.step(0, this.selected.id);
    } else this.requestFrame();
  }

  setFilter(category: Category) {
    clearTimeout(this.snapTimer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const selectedId = this.selected?.id;
    this.scene?.pause();
    this.projects = category === 'all' ? [...PROJECTS] : PROJECTS.filter(project => project.category === category);
    this.current = this.target = Math.max(0, this.projects.findIndex(project => project.id === selectedId));
    this.active = -1;
    this.render();
  }

  selectProject(id: string, instant = false) {
    const index = this.projects.findIndex(project => project.id === id);
    if (index < 0) return;
    this.goTo(index, instant);
  }

  private endDrag(event: PointerEvent, cancel = false) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.pointer = null;
    this.suppressClick = pointer.moved;
    this.stage.classList.remove('is-dragging');
    if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    if (pointer.rotationId) {
      this.scene?.endRotation(cancel || performance.now() - pointer.lastTime > 100);
      return;
    }
    if (pointer.moved || cancel) this.goTo(Math.round(this.target));
  }

  private step(direction: number) { this.goTo(Math.round(this.target) + direction); }

  private goTo(index: number, instant = false) {
    clearTimeout(this.snapTimer);
    this.target = clamp(index, 0, this.projects.length - 1);
    if (instant || this.reducedMotion.matches) {
      this.current = this.target;
      this.position();
    }
    this.updateMetadata(Math.round(this.target));
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
    const factor = this.reducedMotion.matches ? 1 : 1 - Math.pow(1 - MOTION.followSpeed, dt / 16.67);
    this.current += (this.target - this.current) * factor;
    if (Math.abs(this.target - this.current) < MOTION.settleEpsilon) this.current = this.target;
    if (!Number.isInteger(this.target)) this.updateMetadata(Math.round(this.current));
    this.position();
    const rotating = this.scene?.step(dt, this.selected.id) ?? false;
    if (this.current !== this.target || rotating) this.frame = requestAnimationFrame(next => this.animate(next));
  }

  private geometry() {
    const mobile = innerWidth < 700;
    const config = mobile ? MOTION.mobile : MOTION.desktop;
    return {
      size: mobile ? Math.min(innerWidth * config.sizeRatio, innerHeight * .53) : Math.min(innerWidth * .47, innerHeight * config.sizeRatio),
      spacing: innerWidth * config.spacingRatio,
      slope: config.slope,
      mobile,
    };
  }

  private position() {
    const { size, spacing, slope, mobile } = this.geometry();
    this.stage.style.setProperty('--disc-size', `${size}px`);
    this.scene?.updateLayout({ size, spacing, slope, mobile }, this.current);
    this.discs.forEach((disc, index) => {
      const offset = index - this.current;
      const scale = clamp(1 + offset * .07, .65, 1.25);
      disc.style.setProperty('--x', `${offset * spacing}px`);
      disc.style.setProperty('--y', `${offset * spacing * slope}px`);
      disc.style.setProperty('--scale', String(scale));
      disc.style.setProperty('--yaw', `${-31 + offset * 2}deg`);
      disc.style.setProperty('--roll', `${-24 + offset * 2 + (this.target - this.current) * -9}deg`);
      disc.style.setProperty('--shine', `${offset * 15}deg`);
      disc.style.zIndex = String(20 + index);
      const offscreen = Math.abs(offset) > (mobile ? 1.6 : 2.4);
      disc.style.visibility = offscreen ? 'hidden' : 'visible';
      disc.setAttribute('aria-hidden', String(offscreen));
    });
  }

  private updateMetadata(index: number) {
    if (index === this.active) return;
    this.active = index;
    const project = this.selected;
    this.root.querySelector('[data-project-title]')!.textContent = project.title;
    this.root.querySelector('[data-project-category]')!.textContent = project.tags[0];
    this.root.querySelector('[data-project-year]')!.textContent = project.year;
    this.root.querySelector('[data-project-tags]')!.textContent = project.tags.slice(1).join('\n');
    this.root.querySelector('[data-project-quote]')!.textContent = project.subtitle;
    this.root.querySelector('[data-project-label]')!.textContent = project.label;
    this.root.querySelector('[data-counter]')!.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.projects.length).padStart(2, '0')}`;
    this.root.querySelector<HTMLButtonElement>('[data-prev]')!.disabled = index === 0;
    this.root.querySelector<HTMLButtonElement>('[data-next]')!.disabled = index === this.projects.length - 1;
    this.discs.forEach((disc, i) => {
      disc.classList.toggle('is-active', i === index);
      disc.setAttribute('aria-current', String(i === index));
      disc.tabIndex = i === index ? 0 : -1;
    });
    if (!this.reducedMotion.matches) {
      this.root.querySelectorAll('.metadata-value, .gallery-note p').forEach(element => {
        element.getAnimations().forEach(animation => animation.cancel());
        element.animate([{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 550, easing: 'cubic-bezier(.2,.7,.2,1)' });
      });
    }
    this.onChange(project);
  }

  private render() {
    this.stage.innerHTML = this.projects.map(project => discMarkup(project, PROJECTS.indexOf(project))).join('');
    this.discs = [...this.stage.querySelectorAll<HTMLElement>('.disc')];
    this.scene?.setProjects(this.projects);
    this.position();
    this.updateMetadata(Math.round(this.current));
  }
}
