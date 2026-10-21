import { GALLERY_MOTION as M } from './gallery-config';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export type MotionSource = 'wheel' | 'key' | 'click' | 'flick' | 'snap';

/** 贝塞尔曲线先求时间对应的横坐标，再取纵坐标，与 CSS easing 保持一致。 */
export function galleryEase(progress: number) {
  const [x1, y1, x2, y2] = M.curve;
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    if (sample(middle, x1, x2) < progress) low = middle;
    else high = middle;
  }
  return sample((low + high) / 2, y1, y2);
}

/** 所有输入共用一个进度；新操作从眼前的位置重新起步，不累积动画队列。 */
export class GalleryMotion {
  current = 0;
  target = 0;
  velocity = 0;
  private tween: { from: number; start: number; duration: number; snap: boolean } | null = null;
  private dragging = false;

  jump(index: number) {
    this.current = this.target = index;
    this.velocity = 0;
    this.tween = null;
    this.dragging = false;
  }

  hold() { this.jump(this.current); }

  goTo(index: number, count: number, source: MotionSource, instant = false) {
    const target = clamp(Math.round(index), 0, count - 1);
    if (instant) { this.jump(target); return; }
    if (target === this.target && this.tween) return;
    const distance = Math.abs(target - this.current);
    const duration = source === 'key'
      ? Math.min(M.duration.keyMax, M.duration.keyBase + distance * M.duration.keyPerDisc)
      : source === 'click'
        ? clamp(M.duration.clickBase + distance * M.duration.clickPerDisc, M.duration.clickMin, M.duration.clickMax)
        : M.duration[source];
    this.target = target;
    this.dragging = false;
    this.tween = distance < M.settleEpsilon ? null : {
      from: this.current, start: performance.now(), duration, snap: source === 'snap',
    };
    if (!this.tween) this.current = target;
  }

  stepBy(direction: number, count: number, source: MotionSource, instant: boolean) {
    // 连点可继续向前；反向输入立即转向，不必先走完之前的目的地。
    const reversing = direction * (this.target - this.current) < -M.settleEpsilon;
    const destination = reversing
      ? direction > 0 ? Math.floor(this.current) + 1 : Math.ceil(this.current) - 1
      : Math.round(this.target) + direction;
    this.goTo(destination, count, source, instant);
  }

  dragTo(progress: number, count: number, instant: boolean) {
    this.tween = null;
    this.dragging = true;
    this.target = clamp(progress, 0, count - 1);
    if (instant) this.current = this.target;
  }

  release(velocity: number, count: number, instant: boolean, cancel = false) {
    let destination = Math.round(cancel ? this.current : this.target);
    const flick = !cancel && Math.abs(velocity) > M.flickThreshold;
    if (flick) {
      const projection = clamp(velocity * M.flickProjection, -.85, .85);
      destination = Math.round(this.target + projection);
      if (destination === Math.round(this.target)) {
        destination = velocity > 0 ? Math.floor(this.target) + 1 : Math.ceil(this.target) - 1;
      }
    }
    this.goTo(destination, count, flick ? 'flick' : 'snap', instant);
  }

  tick(now: number, dt: number, reduced: boolean) {
    const previous = this.current;
    if (reduced) {
      this.current = this.target;
      this.tween = null;
    } else if (this.tween) {
      const t = clamp((now - this.tween.start) / this.tween.duration, 0, 1);
      const ease = this.tween.snap ? 1 - (1 - t) ** 3 : galleryEase(t);
      this.current = this.tween.from + (this.target - this.tween.from) * ease;
      if (t === 1) { this.current = this.target; this.tween = null; }
    } else if (this.dragging) {
      this.current += (this.target - this.current) * (1 - Math.exp(-M.dragFollow * dt / 1000));
      if (Math.abs(this.target - this.current) < M.settleEpsilon) this.current = this.target;
    }
    const speed = (this.current - previous) * 1000 / Math.max(1, dt);
    this.velocity += (speed - this.velocity) * (1 - Math.exp(-M.velocityFollow * dt / 1000));
    if (reduced || Math.abs(this.velocity) < M.settleEpsilon) this.velocity = 0;
    return !!this.tween || this.current !== this.target || this.velocity !== 0;
  }
}

/** 将触控板的一串衰减事件识别为同一次滑动，避免松手后又多切好几张。 */
export class WheelGesture {
  private lastEvent = -Infinity;
  private lastStep = -Infinity;
  private direction = 0;
  private accumulated = 0;
  private peak = 0;
  private previous = 0;
  private consumed = false;

  reset() {
    this.lastEvent = this.lastStep = -Infinity;
    this.direction = this.accumulated = this.peak = this.previous = 0;
    this.consumed = false;
  }

  consume(delta: number, now: number): number {
    const w = M.wheel;
    const strength = Math.abs(delta);
    if (strength <= w.noise) return 0;
    const direction = Math.sign(delta);
    const gap = now - this.lastEvent;
    const fresh = gap > w.idle || direction !== this.direction;
    if (fresh) {
      this.accumulated = this.peak = this.previous = 0;
      this.consumed = false;
    }
    const envelope = this.peak * Math.exp(-Math.min(gap, w.idle) / w.envelopeDecay);
    const renewed = this.consumed && now - this.lastStep >= w.repeat
      && strength > Math.max(w.threshold, envelope * w.renewedGain, this.previous * w.renewedGain);
    const sustained = this.consumed && now - this.lastStep >= w.sustained
      && strength >= Math.max(w.threshold, this.peak * w.sustainedRatio);
    this.lastEvent = now;
    this.direction = direction;
    this.previous = strength;
    this.peak = Math.max(strength, envelope);
    if (renewed || sustained) { this.accumulated = 0; this.consumed = false; }
    if (this.consumed) return 0;
    this.accumulated += Math.min(w.cap, strength);
    if (this.accumulated < w.threshold) return 0;
    this.consumed = true;
    this.lastStep = now;
    return direction;
  }
}
