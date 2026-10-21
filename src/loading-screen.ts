import { LOADING, type LoadingTask } from './loading-config';
import { LoadingCounter } from './loading-counter';
import { inOutQuad, openingFrame, outCubic, unit, type OpeningDriver } from './disc-opening';

/** 真实任务控制进度上限；滚字、绕盘和展开共用一个可收尾的动画循环。 */
export class LoadingScreen {
  private root = document.querySelector<HTMLElement>('#site-loader')!;
  private count = this.root.querySelector<HTMLElement>('[data-loading-count]')!;
  private status = this.root.querySelector<HTMLElement>('[data-loading-label]')!;
  private counter = new LoadingCounter(this.count);
  private year = new LoadingCounter(this.root.querySelector<HTMLElement>('[data-loading-year]')!, 4, '');
  private completed = new Set<LoadingTask>();
  private started = performance.now();
  private previous = this.started;
  private frame = 0;
  private actual = 0;
  private progress = 0;
  private beat = -1;
  private beatAt = this.started;
  private angle = 0;
  private angleFrom = 0;
  private attachedAt = 0;
  private attachedProgress = 0;
  private fanAt = 0;
  private driver: OpeningDriver | null = null;
  private prepared = false;
  private finished = false;
  private interrupted = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private resolve: (() => void) | null = null;
  private reveal: () => void = () => {};
  private signal: AbortSignal | null = null;

  constructor() {
    this.counter.set('0', this.started + LOADING.initialDelay, LOADING.initialDuration);
    this.year.set(String(LOADING.archiveYear), this.started, 0);
    document.addEventListener('visibilitychange', this.onEnvironmentChange);
    this.reduced.addEventListener('change', this.onEnvironmentChange);
    this.frame = requestAnimationFrame(this.tick);
  }

  complete = (task: LoadingTask) => {
    this.completed.add(task);
    const total = Object.values(LOADING.tasks).reduce((sum, item) => sum + item.weight, 0);
    this.actual = [...this.completed].reduce((sum, key) => sum + LOADING.tasks[key].weight, 0) / total;
    this.root.setAttribute('aria-valuenow', String(Math.round(this.actual * 100)));
    this.status.textContent = this.actual === 1 ? '作品集准备就绪' : LOADING.tasks[task].label;
  };

  /** 资源和第一帧准备完成后交入真实画布；地址变化只缩短演出，不跳过资源准备。 */
  play(driver: OpeningDriver | null, reveal: () => void, signal: AbortSignal) {
    if (this.finished) {
      driver?.finish();
      reveal();
      return Promise.resolve();
    }
    this.driver = driver;
    this.prepared = true;
    this.attachedAt = performance.now();
    this.attachedProgress = this.progress;
    this.reveal = reveal;
    this.signal = signal;
    signal.addEventListener('abort', this.onAbort, { once: true });
    return new Promise<void>(resolve => {
      this.resolve = resolve;
      if (signal.aborted || document.hidden || this.reduced.matches || !driver) this.finish();
      else {
        // 立即覆盖预热时的完整陈列，避免第一帧闪出邻盘。
        try { this.draw(this.attachedAt); }
        catch (error) {
          console.warn('Loading 首帧已回退为直接展示', error);
          this.finish();
        }
      }
    });
  }

  private onAbort = () => {
    this.interrupted = true;
    if (this.prepared) this.finish();
  };

  private onEnvironmentChange = () => {
    if (document.hidden || this.reduced.matches) {
      this.interrupted = true;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.prepared) this.finish();
    } else if (!this.finished && !this.frame) {
      this.previous = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    this.frame = 0;
    if (this.finished) return;
    const elapsed = now - this.started;
    const dt = Math.min(64, now - this.previous);
    this.previous = now;
    const sceneLimit = this.prepared
      ? this.attachedProgress + (1 - this.attachedProgress) * unit((now - this.attachedAt) / LOADING.sceneCreep)
      : LOADING.sceneShare;
    const target = Math.min(this.actual, sceneLimit, unit(elapsed / LOADING.minimumVisible));
    this.progress += (target - this.progress) * (1 - Math.exp(-LOADING.chase * dt / 1000));
    if (target === 1 && this.progress > .998) this.progress = 1;
    const next = LOADING.beats[this.beat + 1];
    if (next && this.progress >= next.progress && elapsed >= next.after) {
      this.beat++;
      this.angleFrom = this.angle;
      this.beatAt = now;
      const value = this.beat === 0 ? LOADING.brand : this.beat === 3 ? '100'
        : String(Math.max(this.beat === 1 ? 40 : 68, Math.min(this.beat === 1 ? 52 : 80, Math.floor(this.progress * 100))));
      this.counter.set(value, now, next.roll);
      this.root.dataset.beat = value;
      if (this.beat === 0) {
        document.body.classList.add('boot-brand');
        this.year.set(String(new Date().getFullYear()), now, next.roll);
      }
    }
    if (this.beat >= 0) {
      const travel = LOADING.beats[this.beat].travel;
      this.angle = this.angleFrom + (Math.PI * (this.beat + 1) / 4 - this.angleFrom) * inOutQuad((now - this.beatAt) / travel);
    }
    if (this.prepared && this.beat === 3 && !this.fanAt
      && now - this.beatAt >= LOADING.beats[3].travel + LOADING.completeHold) {
      this.fanAt = now;
      this.reveal();
      this.root.dataset.phase = 'fan';
    }
    try {
      this.draw(now);
      if (this.prepared && (this.interrupted || !this.driver?.available
        || this.fanAt && now - this.fanAt >= LOADING.fanDuration)) {
        this.finish();
        return;
      }
    } catch (error) {
      console.warn('Loading 演出已回退为直接展示', error);
      this.finish();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw(now: number) {
    const fontHeight = parseFloat(getComputedStyle(this.count).fontSize);
    const fan = this.fanAt ? unit((now - this.fanAt) / LOADING.fanDuration) : -1;
    const anchor = this.driver?.draw(openingFrame(this.progress, this.attachedProgress, fan, fontHeight))
      ?? { x: innerWidth / 2, y: innerHeight * .6, radius: 0 };
    const halfWidth = fontHeight * .88;
    const rx = anchor.radius + halfWidth + fontHeight * LOADING.orbit.gap;
    const ry = anchor.radius + fontHeight * (.5 + LOADING.orbit.gap);
    const margin = LOADING.orbit.margin;
    let x = anchor.x - Math.sin(this.angle) * rx;
    let y = anchor.y + Math.cos(this.angle) * ry;
    x = Math.max(halfWidth + margin, Math.min(innerWidth - halfWidth - margin, x));
    // 轨迹避开导航：桌面导航在顶部，手机与短横屏导航在底部。
    const bottomNav = innerWidth <= 991 || innerHeight <= 600;
    y = Math.max(fontHeight / 2 + (bottomNav ? margin : 60), Math.min(innerHeight - fontHeight / 2 - (bottomNav ? 78 : margin), y));
    this.count.style.left = `${x}px`;
    this.count.style.top = `${y}px`;
    this.counter.leave(fan);
    this.counter.draw(now);
    this.year.draw(now);
    const sideIn = outCubic((now - this.started - LOADING.initialDelay) / LOADING.sideDuration);
    const sideOut = fan < 0 ? 0 : outCubic((now - this.fanAt) / LOADING.sideDuration);
    this.root.style.setProperty('--side-shift', `${(1 - sideIn - sideOut) * 110}%`);
    this.root.style.setProperty('--side-opacity', String(sideIn * (1 - sideOut)));
    this.root.dataset.progress = this.progress.toFixed(4);
    if (this.fanAt) {
      document.body.classList.toggle('boot-nav', now - this.fanAt >= LOADING.navAfter);
      document.body.classList.toggle('boot-copy', now - this.fanAt >= LOADING.copyAfter);
    }
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.onEnvironmentChange);
    this.reduced.removeEventListener('change', this.onEnvironmentChange);
    this.signal?.removeEventListener('abort', this.onAbort);
    try { this.driver?.finish(); }
    finally {
      this.reveal();
      this.root.remove();
      this.resolve?.();
    }
  }
}
