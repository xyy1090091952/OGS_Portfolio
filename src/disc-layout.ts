import { DISC_3D, DISC_OUTLINE } from './disc-config';
import { GALLERY_LAYOUT as L } from './gallery-config';
import { clamp } from './gallery-motion';

export interface GalleryLayout {
  size: number;
  spacing: number;
  slope: number;
  mode: 'desktop' | 'compact' | 'landscape';
  centerX: number;
  centerY: number;
  visibleRange: number;
}

/** 使用舞台的实际尺寸，浏览器地址栏变化不会让 CSS 与三维画布各算一套。 */
export function getGalleryLayout(width: number, height: number): GalleryLayout {
  if (height <= L.shortHeight && width > height) {
    return {
      mode: 'landscape', size: Math.min(width * L.landscape.widthRatio, height * L.landscape.heightRatio),
      spacing: width * .3, slope: 0,
      centerX: width * (L.landscape.centerX - .5), centerY: height * (L.landscape.centerY - .5),
      visibleRange: 2.2,
    };
  }
  if (width <= L.compactWidth) {
    const size = Math.min(
      width * L.compact.widthRatio, height * L.compact.heightRatio, L.compact.maxSize,
      Math.max(L.compact.minSize, height - L.compact.verticalReserve),
    );
    return {
      mode: 'compact', size, spacing: Math.min(width * .57, size * .75 + 16), slope: 0,
      centerX: 0, centerY: height * .01, visibleRange: 2.2,
    };
  }
  return {
    mode: 'desktop', size: Math.min(width * L.desktop.widthRatio, height * L.desktop.heightRatio),
    spacing: width * L.desktop.spacingRatio, slope: L.desktop.slope,
    centerX: 0, centerY: 0, visibleRange: 2.5,
  };
}

/** 两侧预览沿浅弧线缩小、下沉；同一函数也负责 CSS 回退的坐标与尺寸。 */
export function getDiscScreenPlacement(layout: GalleryLayout, offset: number) {
  const distance = clamp(Math.abs(offset), 0, 1);
  const blend = distance * distance * (3 - 2 * distance);
  const desktop = layout.mode === 'desktop';
  return {
    scale: desktop
      ? clamp(1 + offset * .07, DISC_3D.minLayoutScale, DISC_3D.maxLayoutScale)
      : 1 - (1 - L.compact.sideScale) * blend,
    x: layout.centerX + offset * layout.spacing,
    y: layout.centerY + (desktop ? offset * layout.spacing * layout.slope : blend * layout.size * L.compact.dipRatio),
  };
}

/**
 * 深度按顺序递增，同时补偿尺寸和横纵坐标，使屏幕上的陈列位置保持不变。
 * 用完整旋转包围球计算间隔，因此拖拽到侧面或翻转 180° 也不会穿入相邻光盘。
 */
export function getDiscPlacement(layout: GalleryLayout, offset: number, cameraDistance: number, visualOffset = offset) {
  const screen = getDiscScreenPlacement(layout, visualOffset);
  const screenRadius = layout.size * screen.scale / 2;
  const outlineRadius = (1 + DISC_OUTLINE.padding + (DISC_OUTLINE.loops - 1) * DISC_OUTLINE.loopGap)
    * (1 + DISC_OUTLINE.jitter) + DISC_OUTLINE.width / 2;
  const envelopeRadius = layout.size * DISC_3D.maxLayoutScale / 2
    * Math.max(outlineRadius, 1.01) * (1 + DISC_3D.hoverScale) + DISC_3D.hoverLift * 1.1;
  const fraction = envelopeRadius / cameraDistance;
  // dFar * (1 - fraction) > dNear * (1 + fraction)，两张盘完整旋转范围始终分离。
  const depthRatio = (1 + fraction) / (1 - fraction) * DISC_3D.depthSafety;
  const perspectiveScale = Math.pow(depthRatio, offset);
  const distance = cameraDistance * perspectiveScale;
  return {
    perspectiveScale,
    screenRadius,
    radius: screenRadius * perspectiveScale,
    x: screen.x * perspectiveScale,
    y: -screen.y * perspectiveScale,
    z: cameraDistance - distance,
    near: distance * (1 - fraction),
    far: distance * (1 + fraction),
  };
}
