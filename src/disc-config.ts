/** 几何、手感和材质统一配置，调节效果时不需要改动交互逻辑。 */
export const DISC_3D = {
  holeRadius: .14,
  hubRadius: .24,
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
  printMetalness: .48,
  printClearcoat: .8,
  printEnvironment: .7,
  edgeRoughness: .075,
  edgeMetalness: .55,
  silverRoughness: .24,
  silverAnisotropy: .86,
  silverIridescence: .22,
  diffractionStrength: .32,
  environmentIntensity: .9,
};

/** 柔光环境与灯光共用配置，亮面、暗面和冷色轮廓各有分工。 */
export const DISC_LIGHTING = {
  exposure: .86,
  ambient: .25,
  // 本项目正面朝 +Z；主灯从盘面倾向的一侧照入，保证白色印字仍然清晰。
  key: { color: '#fff9e8', intensity: .75, position: [-3.5, 8, 6] },
  fill: { color: '#ffffff', intensity: .3, position: [5, -2, 4] },
  rim: { color: '#499ff5', intensity: .75, position: [0, 3, -6] },
  strip: { intensity: 1.9, width: 6, height: .4, position: [0, 3.2, 3] },
  environmentBands: [
    { latitude: .14, width: .07, intensity: .85 },
    { latitude: .26, width: .077, intensity: .72 },
    { latitude: .4, width: .049, intensity: .51 },
    { latitude: .62, width: .035, intensity: .3 },
  ],
} as const;

export const DISC_HUB = {
  frostOuter: .174,
  matrixOuter: .214,
  halfThickness: .012,
  relief: .0016,
} as const;
