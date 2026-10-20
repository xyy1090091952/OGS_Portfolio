/** CD 转场时间轴。路由交接与动画结束分开，详情出现后光盘仍会继续收起。 */
export const DISC_TRANSITION = {
  press: 120,
  rebound: 160,
  exitDelay: 280,
  exitDuration: 800,
  handover: 670,
  neighborDelay: 120,
  neighborStagger: 65,
  neighborDuration: 550,
  enterDuration: 1050,
  enterStagger: 90,
  enterNeighborDuration: 850,
  pressScale: .94,
  reboundScale: 1.015,
  minimumScale: .001,
  pageFade: 350,
} as const;

export type DiscTransitionDirection = 'exit' | 'enter';

const unit = (value: number) => Math.max(0, Math.min(1, value));
const outCubic = (value: number) => 1 - Math.pow(1 - unit(value), 3);
const inOutCubic = (value: number) => {
  const t = unit(value);
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** 返回临时变换；不写入用户的手动旋转角度，取消时可完整恢复。 */
export function sampleDiscTransition(direction: DiscTransitionDirection, time: number, offset: number) {
  const c = DISC_TRANSITION;
  const selected = offset === 0;
  if (direction === 'enter') {
    const delay = selected ? 0 : c.enterStagger * Math.min(3, Math.abs(offset));
    const duration = selected ? c.enterDuration : c.enterNeighborDuration;
    const progress = outCubic((time - delay) / duration);
    return { scale: c.minimumScale + (1 - c.minimumScale) * progress, turn: 1 - progress, retreat: 1 - progress };
  }
  if (!selected) {
    const delay = c.neighborDelay + Math.min(3, Math.abs(offset)) * c.neighborStagger;
    const progress = inOutCubic((time - delay) / c.neighborDuration);
    return { scale: 1 - (1 - c.minimumScale) * progress, turn: progress, retreat: progress };
  }
  if (time < c.press) {
    return { scale: 1 + (c.pressScale - 1) * outCubic(time / c.press), turn: 0, retreat: 0 };
  }
  if (time < c.exitDelay) {
    return { scale: c.pressScale + (c.reboundScale - c.pressScale) * outCubic((time - c.press) / c.rebound), turn: 0, retreat: 0 };
  }
  const progress = inOutCubic((time - c.exitDelay) / c.exitDuration);
  return { scale: c.reboundScale + (c.minimumScale - c.reboundScale) * progress, turn: progress, retreat: 0 };
}

interface TimelineOptions {
  duration: number;
  handover: number;
  signal: AbortSignal;
  canAnimate(): boolean;
  draw(time: number): void;
  commit(): void;
}

/**
 * 可取消的单一时间轴：后台、减少动态、WebGL 丢失时直接交接页面。
 * 不依赖 setTimeout 链；中途后退不会留下晚到的旧路由回调。
 */
export function runDiscTimeline(options: TimelineOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let committed = false;
    let finished = false;
    const start = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const cleanup = () => {
      cancelAnimationFrame(frame);
      options.signal.removeEventListener('abort', cancel);
      document.removeEventListener('visibilitychange', finishWhenHidden);
      reduced.removeEventListener('change', finishWhenReduced);
    };
    const finish = () => {
      finished = true;
      cleanup();
      resolve();
    };
    const cancel = () => { if (!finished) finish(); };
    const draw = (time: number) => {
      if (finished) return;
      try {
        options.draw(time);
        if (!committed && time >= options.handover) {
          committed = true;
          options.commit();
        }
        if (time >= options.duration) finish();
      } catch (error) {
        finished = true;
        cleanup();
        reject(error);
      }
    };
    const finishWhenHidden = () => { if (document.hidden) draw(options.duration); };
    const finishWhenReduced = () => { if (reduced.matches) draw(options.duration); };
    const tick = (now: number) => {
      draw(options.canAnimate() ? Math.min(now - start, options.duration) : options.duration);
      if (!finished) frame = requestAnimationFrame(tick);
    };
    if (options.signal.aborted) { resolve(); return; }
    options.signal.addEventListener('abort', cancel, { once: true });
    document.addEventListener('visibilitychange', finishWhenHidden);
    reduced.addEventListener('change', finishWhenReduced);
    draw(document.hidden || reduced.matches ? options.duration : 0);
    if (!finished) frame = requestAnimationFrame(tick);
  });
}
