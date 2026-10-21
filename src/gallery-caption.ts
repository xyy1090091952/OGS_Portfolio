import type { Project } from './data';
import { CONTENT_MOTION } from './content-motion-config';
import { animateTextHeights, TextMotion } from './text-motion';

type Phase = 'visible' | 'out' | 'hidden' | 'in';

/**
 * 选中作品立即交给画廊；可见文案等旧内容退出后再更新。
 * 连续输入只覆盖 pending，不排队播放已经过时的描述。
 */
export class GalleryCaption {
  private pending: Project | null = null;
  private phase: Phase = 'visible';
  private departing = false;
  private revision = 0;
  private timer = 0;
  private changedAt = 0;
  private run: TextMotion | null = null;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private groups: HTMLElement[];

  constructor(private root: HTMLElement) {
    this.groups = [...root.querySelectorAll<HTMLElement>('[data-copy-group]')];
    window.addEventListener('resize', () => this.settle());
    this.reduced.addEventListener('change', () => this.settle());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.settle(); });
  }

  show(project: Project, instant = false) {
    this.pending = project;
    this.changedAt = performance.now();
    if (instant || this.reduced.matches || this.root.hidden || document.hidden) { this.settle(); return; }
    if (this.phase === 'hidden') this.scheduleEnter();
    else if (this.phase !== 'out') this.hide();
  }

  leave() {
    this.departing = true;
    clearTimeout(this.timer);
    if (this.phase === 'visible' || this.phase === 'in') this.hide();
  }

  enter() {
    this.settle();
    if (this.reduced.matches || document.hidden) return;
    this.setPhase('hidden');
    this.reveal();
  }

  /** 路由取消、窗口变化和减少动态时归一，不能留下遮罩或旧文案。 */
  settle() {
    ++this.revision;
    clearTimeout(this.timer);
    this.run?.clear();
    this.run = null;
    this.departing = false;
    this.write();
    this.setPhase('visible');
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.root.dataset.captionState = phase;
  }

  private texts() { return this.groups.flatMap(group => [...group.querySelectorAll<HTMLElement>('[data-copy-text]')]); }

  private write() {
    const project = this.pending;
    if (!project) return;
    const values: Record<string, string> = {
      title: project.title,
      category: project.tags[0],
      year: project.year,
      tags: project.tags.slice(1).join('\n'),
      quote: project.subtitle,
      label: project.label,
    };
    Object.entries(values).forEach(([key, value]) => {
      this.root.querySelector(`[data-project-${key}]`)!.textContent = value;
    });
    this.root.dataset.captionProject = project.id;
  }

  private animate(direction: 'in' | 'out', run: TextMotion) {
    const c = CONTENT_MOTION.caption;
    this.groups.forEach((group, groupIndex) => {
      if (!group.getClientRects().length) return;
      group.querySelectorAll<HTMLElement>('[data-copy-text]').forEach((element, index) => {
        run.text(element, direction, direction === 'in' ? c.enter : c.out,
          direction === 'in' ? index * c.enterItem + groupIndex * c.group : index * c.outItem,
          direction === 'in' ? c.enterLine : c.outLine);
      });
      group.querySelectorAll<HTMLElement>('[data-copy-rule]').forEach((element, index) => {
        run.rule(element, direction, direction === 'in' ? c.enter : c.out, index * c.outItem);
      });
    });
  }

  private hide() {
    const revision = ++this.revision;
    clearTimeout(this.timer);
    if (this.phase === 'in' && this.run) {
      // 新文字还没完全展开时沿原路径退回，避免突然跳到另一个退出位置。
      this.run.reverse(CONTENT_MOTION.caption.reverseSpeed);
    } else {
      this.run?.clear();
      this.run = new TextMotion();
      this.animate('out', this.run);
    }
    this.setPhase('out');
    void this.run.finished.then(() => {
      if (revision !== this.revision) return;
      this.setPhase('hidden');
      if (!this.departing) this.scheduleEnter();
    });
  }

  private scheduleEnter() {
    clearTimeout(this.timer);
    if (this.departing) return;
    const remaining = Math.max(0, CONTENT_MOTION.caption.settle - (performance.now() - this.changedAt));
    this.timer = window.setTimeout(() => this.reveal(), remaining);
  }

  private reveal() {
    const revision = ++this.revision;
    const sizes = new Map(this.texts().map(element => [element, element.getBoundingClientRect().height]));
    this.run?.clear();
    this.write();
    const run = this.run = new TextMotion();
    this.animate('in', run);
    animateTextHeights(run, sizes, CONTENT_MOTION.caption.height);
    this.setPhase('in');
    void run.finished.then(() => {
      if (revision !== this.revision) return;
      run.clear();
      this.run = null;
      this.setPhase('visible');
    });
  }
}
