/** 内容集中维护：更换真实作品时，只需编辑此文件和 public/art 内的素材。 */
export type Category = 'all' | 'experience' | 'motion' | 'visual';
export interface Project {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  category: Exclude<Category, 'all'>;
  year: string;
  artwork: 'nature' | 'motion' | 'digital' | 'film' | 'graphic';
  image?: string;
  color: string;
  ink: string;
  lines: [string, string];
  description: string;
  approach: string;
  tags: string[];
}

export const PROFILE = {
  name: 'Old_glasses',
  handle: '@Old_glasses',
  motto: 'With Creative From Heart.',
  intro: '独立设计师，聚焦体验设计与创意设计。',
  bio: '从 2016 年开始，服务于大型互联网公司的视觉设计工作。相信好的设计，既能解决问题，也能让人心动。喜欢好看的任何东西，当然，也喜欢猫。',
};

export const FILTERS: { id: Category; name: string }[] = [
  { id: 'all', name: '全部作品' },
  { id: 'experience', name: '体验设计' },
  { id: 'motion', name: '动态影像' },
  { id: 'visual', name: '视觉实验' },
];

/** 当前均为概念示例，详情页会明确展示，避免被误认为真实商业履历。 */
export const PROJECTS: Project[] = [
  {
    id: 'form-and-feel', title: 'FORM & FEEL', subtitle: '让灵感，自然生长。',
    label: '形态与感知', category: 'visual', year: '2026',
    artwork: 'nature', color: '#172f26', ink: '#e5efb9', lines: ['FORM', '& FEEL'],
    description: '从一片卷曲的花瓣出发，寻找自然形态与视觉秩序之间的关系。以克制的色彩、柔软的曲线和微妙的光影，让日常事物呈现新的表情。',
    approach: '将植物的有机曲线转化为一组视觉语言，探索它在海报、数字界面与动态构图中的可能性。',
    tags: ['视觉探索', '艺术指导', '自然形态'],
  },
  {
    id: 'in-motion', title: 'IN MOTION', subtitle: '给想象，一点动能。',
    label: '流动的想象', category: 'motion', year: '2026',
    artwork: 'motion', color: '#a62b22', ink: '#fff0d8', lines: ['IN', 'MOTION'],
    description: '金属的冷静与玻璃的热烈，在同一个画面中相遇。以材质、节奏和空间关系为线索，探索具有触感的动态视觉。',
    approach: '用旋转、停顿和释放建立视觉节奏。让每一次运动都有起点、重量和自然的落点。',
    tags: ['动态设计', '材质探索', '三维概念'],
  },
  {
    id: 'soft-interface', title: 'SOFT SYSTEM', subtitle: '理性的秩序，感性的体验。',
    label: '柔性界面', category: 'experience', year: '2025',
    artwork: 'digital', color: '#1a32ac', ink: '#e4e5ff', lines: ['SOFT', 'SYSTEM'],
    description: '把复杂藏在结构里，把简单留给使用者。以柔软的形态作为起点，思考数字产品如何通过清晰的信息层级与细腻反馈，建立亲近感。',
    approach: '从信息结构到交互反馈，围绕一致性、可理解性与操作效率，构建可延展的体验设计概念。',
    tags: ['UI / UX', '设计系统', '交互探索'],
  },
  {
    id: 'somewhere', title: 'SOMEWHERE', subtitle: '在日常之外，遇见片刻。',
    label: '某处的光', category: 'motion', year: '2025',
    artwork: 'film', color: '#c4996e', ink: '#442b1c', lines: ['SOME', 'WHERE'],
    description: '一个人、一片沙丘和一束光。通过留白与尺度的对比，记录人与环境之间安静而微妙的关系。',
    approach: '以电影感的色彩和构图探索叙事氛围，为短片的视觉基调与镜头语言提供概念方向。',
    tags: ['影像概念', '色彩研究', '视觉叙事'],
  },
  {
    id: 'play-together', title: 'PLAY / FORM', subtitle: '不设边界，认真玩。',
    label: '形状游乐场', category: 'visual', year: '2026',
    artwork: 'graphic', color: '#583574', ink: '#f1d9ff', lines: ['PLAY', '/ FORM'],
    description: '用透明、折射与相互嵌套的几何形态，构建一场小型视觉游戏。让材料自己讲故事，让偶然成为设计的一部分。',
    approach: '将几何形式与玻璃材质组合，探索从二维平面到三维空间的视觉延伸。',
    tags: ['平面设计', '创意实验', '几何构成'],
  },
];

export const MOTION = {
  // 连续滚动进度以「一张光盘」为单位，屏幕尺寸变化不改变当前作品。
  wheelPixelsPerDisc: 650,
  wheelSnapDelay: 180,
  dragThreshold: 7,
  followSpeed: 0.095,
  settleEpsilon: 0.0005,
  desktop: { sizeRatio: 0.69, spacingRatio: 0.365, slope: -0.46 },
  mobile: { sizeRatio: 0.92, spacingRatio: 0.85, slope: -0.28 },
};
