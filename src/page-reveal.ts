import { CONTENT_MOTION } from './content-motion-config';
import { TextMotion } from './text-motion';

/** 页面只负责标记内容类型，标题、资料、细线和按钮共用这份入场时间表。 */
export class PageReveal {
  private runs = new Set<TextMotion>();
  private observer: IntersectionObserver | null = null;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private disposed = false;

  constructor(private root: HTMLElement, private signal: AbortSignal, animate: boolean) {
    root.dataset.revealState = 'ready';
    if (!animate || signal.aborted || this.reduced.matches || document.hidden) return;
    signal.addEventListener('abort', this.finish, { once: true });
    window.addEventListener('resize', this.finish);
    this.reduced.addEventListener('change', this.finish);
    document.addEventListener('visibilitychange', this.onVisibility);
    root.dataset.revealState = 'playing';
    const hero = root.querySelector<HTMLElement>('[data-reveal-hero]');
    if (hero) this.play(hero, true);
    else root.dataset.revealState = 'ready';
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const section = entry.target as HTMLElement;
        this.observer?.unobserve(section);
        section.classList.remove('is-reveal-pending');
        this.play(section);
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
    root.querySelectorAll<HTMLElement>('[data-reveal-scroll]').forEach(section => {
      section.classList.add('is-reveal-pending');
      this.observer!.observe(section);
    });
  }

  /** 取消后恢复自然排版；同一路由的锚点跳转也能立即读到全部内容。 */
  finish = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.runs.forEach(run => run.clear());
    this.runs.clear();
    this.root.querySelectorAll('.is-reveal-pending').forEach(element => element.classList.remove('is-reveal-pending'));
    this.root.dataset.revealState = 'ready';
    this.signal.removeEventListener('abort', this.finish);
    window.removeEventListener('resize', this.finish);
    this.reduced.removeEventListener('change', this.finish);
    document.removeEventListener('visibilitychange', this.onVisibility);
  };

  private onVisibility = () => { if (document.hidden) this.finish(); };

  private play(section: HTMLElement, hero = false) {
    if (this.disposed) return;
    const run = new TextMotion();
    this.runs.add(run);
    const c = CONTENT_MOTION.page;
    const counts: Record<string, number> = {};
    if (!hero) {
      run.animate(section, [
        { opacity: 0, transform: `translateY(${c.scrollOffset}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ], c.title);
    }
    section.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element => {
      const kind = element.dataset.reveal!;
      const index = counts[kind] ?? 0;
      counts[kind] = index + 1;
      if (kind === 'title') {
        run.text(element, 'in', c.title, index * c.titleLine, c.titleLine);
      } else if (kind === 'text') {
        run.text(element, 'in', c.title, c.textDelay + index * c.textItem, c.textLine);
      } else if (kind === 'rule' || kind === 'button-rule') {
        run.rule(element, 'in', kind === 'rule' ? c.rule : c.button,
          kind === 'rule' ? c.ruleDelay + index * c.ruleStagger : c.buttonDelay + index * c.buttonLine);
      } else if (kind === 'corner') {
        run.animate(element, [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.25)', opacity: 1, offset: .65 },
          { transform: 'scale(1)', opacity: 1 },
        ], c.corner, c.cornerDelay + index * c.cornerStagger);
      } else if (kind === 'button-text') {
        run.text(element, 'in', c.button, c.buttonDelay + 40 + index * c.buttonLine, c.textLine);
      }
    });
    void run.finished.then(() => {
      if (this.disposed) return;
      run.clear();
      this.runs.delete(run);
      if (hero) this.root.dataset.revealState = 'ready';
    });
  }
}
