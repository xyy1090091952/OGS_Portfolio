/** 几何、手感和材质统一配置，调节效果时不需要改动交互逻辑。 */
export const DISC_3D = {
  holeRadius: .125,
  hubRadius: .22,
  thickness: .018,
  segments: 256,
  edgeBevel: .0015,
  edgeBevelSegments: 6,
  pixelRatioLimit: 2,
  mobilePixelRatioLimit: 1.5,
  maxRenderPixels: 12_000_000,
  dragRadiansPerDiameter: Math.PI * 2,
  inertiaDecay: .92,
  maxAngularSpeed: .065,
  flipDuration: 720,
  hoverTilt: .21,
  hoverLift: 14,
  hoverScale: .012,
  hoverSpring: 105,
  hoverDamping: 18,
  hoverEpsilon: .0002,
  // 为任意旋转、悬停抬起和外沿笔触预留空间，前后光盘的深度范围不能相交。
  depthSafety: 1.06,
  maxLayoutScale: 1.25,
  minLayoutScale: .65,
};

/** 依据原站观察到的双弧、笔锋与逐帧生长节奏配置，长度以光盘半径为单位。 */
export const DISC_OUTLINE = {
  framesPerSecond: 10,
  segments: 128,
  controlPoints: 24,
  loops: 2,
  padding: .06,
  loopGap: .045,
  jitter: .028,
  width: .012,
  sweep: .68,
  sweepJitter: .4,
  entrance: [.3, .5, .72, 1],
  exit: [.72, .5, .3],
};

export const DISC_FINISH = {
  printRoughness: .42,
  printMetalness: .32,
  printClearcoat: .8,
  silverRoughness: .24,
  silverAnisotropy: .86,
  silverIridescence: .22,
  diffractionStrength: .32,
  environmentIntensity: .9,
};
