/** 依据原站的运行时参数整理；时间单位为毫秒，进度单位为「一张光盘」。 */
export const GALLERY_MOTION = {
  curve: [.32, .72, 0, 1] as const,
  cssCurve: 'cubic-bezier(.32,.72,0,1)',
  duration: {
    wheel: 510,
    keyBase: 420, keyPerDisc: 50, keyMax: 600,
    clickBase: 450, clickPerDisc: 110, clickMin: 460, clickMax: 1050,
    flick: 560, snap: 420,
  },
  dragThreshold: 7,
  dragFollow: 24,
  flickThreshold: .45,
  flickProjection: .18,
  stalePointer: 100,
  velocityFollow: 18,
  settleEpsilon: .0005,
  wheel: {
    noise: .3, threshold: 6, cap: 24,
    idle: 150, repeat: 190, sustained: 480,
    renewedGain: 1.2, sustainedRatio: .8, envelopeDecay: 550,
  },
  flow: {
    lean: .055, maxLean: .3, bank: .32, dip: .3,
    follow: 12, discFollow: 11, distanceFalloff: 1.15, minFollow: 6.5,
    // 跟随差异只作用于投影位置，深度仍使用公共进度，确保前后空间始终分离。
    maxLag: .1,
  },
} as const;

/** 与 CSS 的 991px / 767px / 600px 断点对应，几何参数供 WebGL 和回退共用。 */
export const GALLERY_LAYOUT = {
  compactWidth: 991,
  phoneWidth: 767,
  shortHeight: 600,
  desktop: { widthRatio: .47, heightRatio: .69, spacingRatio: .365, slope: -.46 },
  compact: { widthRatio: .76, heightRatio: .43, maxSize: 550, verticalReserve: 340, minSize: 120, sideScale: .48, dipRatio: .23 },
  landscape: { widthRatio: .38, heightRatio: .58, centerX: .61, centerY: .44 },
} as const;
