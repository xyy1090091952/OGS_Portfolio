import { CONTENT_MOTION } from './content-motion-config';

interface TextPoint { node: Text; offset: number }
interface MeasuredLine { start: TextPoint; end: TextPoint; top: number }

/**
 * 按浏览器实际换行拆分，兼容中文、自然折行与 <br>。
 * 只在动画期间创建遮罩，结束后放回原节点，窗口缩放仍由 CSS 自然排版。
 */
function splitLines(element: HTMLElement) {
  const original = [...element.childNodes];
  const measured: MeasuredLine[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    let offset = 0;
    for (const character of text.data) {
      const end = offset + character.length;
      range.setStart(text, offset);
      range.setEnd(text, end);
      const rect = range.getBoundingClientRect();
      // 折行符和被浏览器折叠的空格没有可见宽度，不单独生成空行。
      if (rect.width > 0 && rect.height > 0 && character !== '\n') {
        const previous = measured.at(-1);
        if (previous && Math.abs(previous.top - rect.top) < 2) previous.end = { node: text, offset: end };
        else measured.push({ start: { node: text, offset }, end: { node: text, offset: end }, top: rect.top });
      }
      offset = end;
    }
  }
  if (!measured.length) return { lines: [] as HTMLElement[], restore: () => {} };
  const fragment = document.createDocumentFragment();
  const lines = measured.map(line => {
    range.setStart(line.start.node, line.start.offset);
    range.setEnd(line.end.node, line.end.offset);
    const mask = document.createElement('span');
    mask.className = 'motion-mask';
    const inner = document.createElement('span');
    inner.className = 'motion-line';
    let content: Node = range.cloneContents();
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentNode!;
    // 一整行都位于 <em> 等标签里时，Range 不会复制外层；补回它以保留字形。
    while (ancestor !== element && element.contains(ancestor)) {
      const wrapper = ancestor.cloneNode(false);
      wrapper.appendChild(content);
      content = wrapper;
      ancestor = ancestor.parentNode!;
    }
    inner.append(content);
    mask.append(inner);
    fragment.append(mask);
    return inner;
  });
  element.replaceChildren(fragment);
  element.classList.add('is-line-split');
  return {
    lines,
    restore: () => {
      element.replaceChildren(...original);
      element.classList.remove('is-line-split');
    },
  };
}

/** 每个演出拥有自己的动画和临时节点；取消时不影响光盘、Loading 或其他页面。 */
export class TextMotion {
  private animations: Animation[] = [];
  private restorers: (() => void)[] = [];

  lines(element: HTMLElement) {
    const split = splitLines(element);
    this.restorers.push(split.restore);
    return split.lines;
  }

  animate(element: HTMLElement, frames: Keyframe[], duration: number, delay = 0, easing = CONTENT_MOTION.ease) {
    const animation = element.animate(frames, { duration, delay, easing, fill: 'both' });
    this.animations.push(animation);
    return animation;
  }

  text(element: HTMLElement, direction: 'in' | 'out', duration: number, delay: number, stagger: number) {
    this.lines(element).forEach((line, index) => {
      const from = direction === 'in' ? CONTENT_MOTION.offset : 0;
      const to = direction === 'in' ? 0 : -CONTENT_MOTION.offset;
      this.animate(line, [{ transform: `translateY(${from}%)` }, { transform: `translateY(${to}%)` }], duration, delay + index * stagger);
    });
  }

  rule(element: HTMLElement, direction: 'in' | 'out', duration: number, delay: number) {
    const origin = direction === 'in' ? 'left' : 'right';
    this.animate(element, [
      { transform: `scaleX(${direction === 'in' ? 0 : 1})`, transformOrigin: origin },
      { transform: `scaleX(${direction === 'in' ? 1 : 0})`, transformOrigin: origin },
    ], duration, delay);
  }

  reverse(speed: number) {
    this.animations.forEach(animation => animation.updatePlaybackRate(-speed));
  }

  get finished() {
    // reverse 会产生新的 finished Promise；取消属于正常交互，不向外抛出拒绝。
    return Promise.all(this.animations.map(animation => animation.finished.catch(() => {})));
  }

  clear() {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.restorers.forEach(restore => restore());
    this.restorers = [];
  }
}

/** 多行标签换高时平滑过渡；所有读尺寸操作在创建动画前完成。 */
export function animateTextHeights(run: TextMotion, sizes: Map<HTMLElement, number>, duration: number) {
  const changes = [...sizes].map(([element, before]) => ({ element, before, after: element.getBoundingClientRect().height }));
  changes.forEach(({ element, before, after }) => {
    if (Math.abs(after - before) > 1) run.animate(element, [{ height: `${before}px` }, { height: `${after}px` }], duration);
  });
}
