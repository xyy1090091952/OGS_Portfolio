import { LOADING } from './loading-config';
import { clamp, galleryEase } from './gallery-motion';

export const unit = (value: number) => clamp(value, 0, 1);
export const outCubic = (value: number) => 1 - (1 - unit(value)) ** 3;
export const outQuart = (value: number) => 1 - (1 - unit(value)) ** 4;
export const inOutQuad = (value: number) => {
  const t = unit(value);
  return t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
};

export interface OpeningFrame {
  rise: number;
  turn: number;
  /** -1 表示还在加载；0…1 表示光盘向两侧展开。 */
  fan: number;
  fontHeight: number;
}

export interface DiscAnchor { x: number; y: number; radius: number }

/** 数字只读取真实光盘的投影，不另画一张装饰用的 CD。 */
export interface OpeningDriver {
  readonly available: boolean;
  draw(frame: OpeningFrame): DiscAnchor;
  finish(): void;
}

export function openingFrame(progress: number, attachedAt: number, fan: number, fontHeight: number): OpeningFrame {
  const start = attachedAt + LOADING.scene.riseAfter;
  return {
    rise: outCubic((progress - start) / Math.max(.01, 1 - start)),
    turn: 1 - (1 - unit((progress - start) / Math.max(.01, LOADING.scene.turnBy - start))) ** 2.4,
    fan, fontHeight,
  };
}

/** 所有临时缩放均落在 flight 层，结束时不改变手动姿态与陈列位置。 */
export function openingScale(frame: OpeningFrame, offset: number) {
  const c = LOADING.scene;
  if (offset) {
    const delay = c.neighborDelay;
    return frame.fan < 0 ? 0 : galleryEase(unit((frame.fan - delay) / c.neighborDuration));
  }
  const growth = frame.fan < 0 ? 0 : galleryEase(unit(frame.fan));
  return Math.max(.001, c.boost * unit(frame.rise / c.growBy)) * (1 + (1 / c.boost - 1) * growth);
}
