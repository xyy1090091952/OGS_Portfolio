import type { Project } from './data';
import { LOADING, withDeadline, type LoadingReporter } from './loading-config';

const coverImages = new Map<string, HTMLImageElement | null>();
let preparation: Promise<void> | null = null;

/** 同一张已解码的封面同时供 CSS 和三维印刷层使用，避免入场后再换图。 */
export function getCoverImage(source?: string) {
  return source ? coverImages.get(source) ?? null : null;
}

async function loadCover(source: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  try {
    image.src = source;
    await withDeadline(image.decode(), LOADING.resourceTimeout);
    coverImages.set(source, image);
  } catch {
    // 失败的封面保持程序绘制版本；超时资源晚到时也不再替换可见盘面。
    image.src = '';
    coverImages.set(source, null);
  }
}

async function loadFont(config: typeof LOADING.fonts[number]) {
  try {
    const font = new FontFace(config.family, `url("${config.source}")`, { weight: config.weight, style: 'normal' });
    await withDeadline(font.load(), LOADING.resourceTimeout);
    // 只注册及时加载成功的字体；晚到的字体不再改变已经展示的排版。
    document.fonts.add(font);
  } catch {
    // 本机字体是明确的回退，离线或字体损坏时也能进入作品集。
  }
}

/** 字体与封面并行准备，所有消费者等待同一个 Promise。 */
export function preloadAssets(projects: Project[], report: LoadingReporter): Promise<void> {
  if (!preparation) {
    const sources = [...new Set(projects.flatMap(project => project.image ? [project.image] : []))];
    preparation = Promise.all([
      Promise.all(LOADING.fonts.map(loadFont)).then(() => report('fonts')),
      Promise.all(sources.map(loadCover)).then(() => report('covers')),
    ]).then(() => {});
  }
  return preparation;
}
