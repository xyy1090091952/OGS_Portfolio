import { LOADING, type LoadingTask } from './loading-config';

/** Loading 的视觉状态独立于作品选择和路由，只在一次页面启动期间存在。 */
export class LoadingScreen {
  private root = document.querySelector<HTMLElement>('#site-loader')!;
  private progress = this.root.querySelector<HTMLElement>('[data-loading-progress]')!;
  private count = this.root.querySelector<HTMLElement>('[data-loading-count]')!;
  private label = this.root.querySelector<HTMLElement>('[data-loading-label]')!;
  private completed = new Set<LoadingTask>();
  private started = performance.now();

  complete = (task: LoadingTask) => {
    this.completed.add(task);
    const total = Object.values(LOADING.tasks).reduce((sum, item) => sum + item.weight, 0);
    const done = [...this.completed].reduce((sum, key) => sum + LOADING.tasks[key].weight, 0);
    const percent = Math.round(done / total * 100);
    this.count.textContent = String(percent).padStart(3, '0');
    this.progress.setAttribute('aria-valuenow', String(percent));
    this.root.style.setProperty('--loading-progress', String(percent / 100));
    this.label.textContent = percent === 100 ? '准备就绪' : LOADING.tasks[task].label;
  };

  async ready() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduced ? 0 : Math.max(LOADING.completeHold, LOADING.minimumVisible - (performance.now() - this.started));
    if (delay) await new Promise<void>(resolve => window.setTimeout(resolve, delay));
  }

  async reveal() {
    this.root.setAttribute('aria-hidden', 'true');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (!reduced.matches && !document.hidden) {
      const animation = this.root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: LOADING.exitDuration, easing: 'ease-out', fill: 'forwards',
      });
      // 切后台或中途开启减少动态时，完成遮罩退出，不留下不可点击的页面。
      const finish = () => { if (document.hidden || reduced.matches) animation.finish(); };
      document.addEventListener('visibilitychange', finish);
      reduced.addEventListener('change', finish);
      try { await animation.finished; } catch { /* 动画取消时仍需移除遮罩。 */ }
      finally {
        document.removeEventListener('visibilitychange', finish);
        reduced.removeEventListener('change', finish);
      }
    }
    this.root.remove();
  }
}
