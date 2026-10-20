import './style.css';
import './artwork.css';
import { FILTERS, PROFILE, PROJECTS, type Category } from './data';
import { DiscGallery } from './gallery';
import { aboutPage, ICONS, projectPage } from './pages';
import { DISC_TRANSITION } from './disc-transition';

document.querySelector('#app')!.innerHTML = `
  <header class="site-header">
    <nav class="nav-dock" aria-label="主导航">
      <a class="nav-logo" href="#work" aria-label="Old glasses 首页">${ICONS.glasses}<b>OG</b><sup>®</sup></a>
      <a href="#work" class="nav-link" data-nav="work">作品 <small>WORK</small></a>
      <a href="#about" class="nav-link" data-nav="about">关于 <small>ABOUT</small></a>
      <button class="nav-link index-toggle" aria-expanded="false" aria-controls="project-index">索引 <sup data-total>${PROJECTS.length}</sup><span class="chevron">⌄</span></button>
    </nav>
    <div class="project-index" id="project-index" inert>
      <div class="index-inner">
        <div class="filter-tabs" role="group" aria-label="作品分类">${FILTERS.map((filter, index) => `<button data-filter="${filter.id}" aria-pressed="${index === 0}" class="${index === 0 ? 'is-active' : ''}">${filter.name}</button>`).join('')}</div>
        <div class="index-list"></div>
        <div class="index-foot"><span>个人作品档案</span><span>2016 — ${new Date().getFullYear()}</span></div>
      </div>
    </div>
  </header>
  <button class="index-backdrop" aria-label="关闭作品索引" tabindex="-1" hidden></button>
  <main>
    <section class="gallery-page" aria-label="Old glasses 作品光盘画廊">
      <h1 class="sr-only">Old_glasses — With Creative From Heart</h1>
      <div class="project-caption" aria-live="polite" aria-atomic="true">
        <div class="title-mask"><h2 class="metadata-value" data-project-title></h2></div>
        <dl class="caption-metadata">
          <div><dt>设计师 / DESIGNER</dt><dd>${PROFILE.name}</dd></div>
          <div><dt>年份 / YEAR</dt><dd class="metadata-value" data-project-year></dd></div>
          <div><dt>领域 / CATEGORY</dt><dd class="metadata-value" data-project-category></dd></div>
          <div><dt>探索 / EXPLORATION</dt><dd class="metadata-value" data-project-tags></dd></div>
        </dl>
      </div>
      <div class="archive-label"><span>PERSONAL ARCHIVE</span><span>概念作品集</span></div>
      <div class="disc-stage" role="group" aria-label="鼠标拖动光盘旋转，滚动切换；触屏横滑切换、纵拖旋转；F 翻面，R 归位，方向键切换" tabindex="0"></div>
      <div class="gallery-notes">
        <div class="gallery-note"><span class="note-symbol" aria-hidden="true">✳</span><span class="micro">DESIGN PHILOSOPHY</span><p>“WITH CREATIVE<br>FROM HEART.”</p></div>
        <div class="gallery-note"><span class="note-symbol" aria-hidden="true">✳</span><span class="micro" data-project-label></span><p data-project-quote></p></div>
      </div>
      <button class="open-project" data-explore>查看作品 <span>↗</span></button>
      <div class="disc-tools" role="group" aria-label="光盘操作" hidden><button data-flip aria-label="翻转当前光盘">翻面 <span>↻</span></button><button data-reset aria-label="光盘恢复正面角度">归位 <span>↺</span></button></div>
      <div class="gallery-controls"><button data-prev aria-label="上一个作品">←</button><span data-counter></span><button data-next aria-label="下一个作品">→</button></div>
      <div class="gallery-instructions"><span>SCROLL TO EXPLORE</span><span class="flat-instructions">滚动 / 横滑浏览</span><span class="spatial-instructions">拖动光盘旋转 · 滚动切换作品</span><span class="touch-instructions">横滑切换作品 · 纵拖光盘旋转</span></div>
      <button class="help-toggle" aria-label="查看操作提示" aria-expanded="false" aria-controls="gallery-help">+</button>
      <aside class="gallery-help" id="gallery-help" hidden><strong>把每一个想法，收进一张唱片。</strong><p>鼠标拖动光盘可旋转，松手后随惯性停下。<br>滚动鼠标或拖动空白区域切换作品。<br>触屏横滑切换作品，纵拖光盘旋转。<br>点击当前光盘打开详情。<br>F 翻面 · R 归位 · 方向键切换。</p><span>Old_glasses / With Creative From Heart.</span></aside>
    </section>
    <section class="content-page" hidden></section>
  </main>
  <div class="toast" role="status"></div>
`;

const header = document.querySelector<HTMLElement>('.site-header')!;
const menu = document.querySelector<HTMLElement>('.project-index')!;
const backdrop = document.querySelector<HTMLButtonElement>('.index-backdrop')!;
const indexToggle = document.querySelector<HTMLButtonElement>('.index-toggle')!;
const galleryElement = document.querySelector<HTMLElement>('.gallery-page')!;
const content = document.querySelector<HTMLElement>('.content-page')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let filter: Category = 'all';
let selectedId = PROJECTS[0].id;
let currentRoute = '';
let navigationId = 0;
let navigation: AbortController | null = null;
let navigationTask = Promise.resolve();

const gallery = new DiscGallery(galleryElement, project => { location.hash = `project/${project.id}`; }, project => {
  selectedId = project.id;
  document.querySelectorAll<HTMLElement>('[data-select]').forEach(row => {
    const selected = row.dataset.select === selectedId;
    row.classList.toggle('is-active', selected);
    row.setAttribute('aria-current', String(selected));
  });
});

function renderIndex() {
  document.querySelector('.index-list')!.innerHTML = gallery.visibleProjects.map(project => `
    <button class="index-row ${project.id === selectedId ? 'is-active' : ''}" data-select="${project.id}" aria-current="${project.id === selectedId}">
      <span>${project.title}</span><span>${project.year}</span>
    </button>`).join('');
  document.querySelector('[data-total]')!.textContent = String(gallery.visibleProjects.length);
}

function setMenu(open: boolean, restoreFocus = false, syncGallery = true) {
  header.classList.toggle('index-open', open);
  indexToggle.setAttribute('aria-expanded', String(open));
  menu.inert = !open;
  backdrop.hidden = !open;
  if (syncGallery) gallery.setEnabled(!open && currentRoute === 'work');
  if (restoreFocus) indexToggle.focus();
}
indexToggle.addEventListener('click', () => setMenu(indexToggle.getAttribute('aria-expanded') !== 'true'));
backdrop.addEventListener('click', () => setMenu(false, true));
menu.addEventListener('click', event => {
  const target = event.target as Element;
  const filterButton = target.closest<HTMLButtonElement>('[data-filter]');
  if (filterButton) {
    filter = filterButton.dataset.filter as Category;
    gallery.setFilter(filter);
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderIndex();
    return;
  }
  const row = target.closest<HTMLButtonElement>('[data-select]');
  if (row) {
    const id = row.dataset.select!;
    if (currentRoute !== 'work') location.hash = 'work';
    setMenu(false);
    gallery.selectProject(id, currentRoute !== 'work');
    galleryElement.querySelector<HTMLElement>('.disc-stage')?.focus({ preventScroll: true });
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (header.classList.contains('index-open')) setMenu(false, true);
  else if (!document.querySelector<HTMLElement>('.gallery-help')!.hidden) setHelp(false);
  else if (location.hash && location.hash !== '#work') location.hash = 'work';
});

function setHelp(open: boolean) {
  document.querySelector<HTMLElement>('.gallery-help')!.hidden = !open;
  document.querySelector('.help-toggle')!.setAttribute('aria-expanded', String(open));
}
document.querySelector('.help-toggle')!.addEventListener('click', () => setHelp(document.querySelector<HTMLElement>('.gallery-help')!.hidden));

/** 最新一次导航拥有换页权；先取消并清理旧动画，避免快速前进/后退留下旧画布。 */
function navigate(initial = false) {
  const generation = ++navigationId;
  navigation?.abort();
  const controller = new AbortController();
  navigation = controller;
  const previous = navigationTask;
  const requestedHash = location.hash.slice(1);
  navigationTask = (async () => {
    // 等旧动画的 finally 归还画布，再启动下一次转场。
    await previous;
    if (controller.signal.aborted) return;
    const [section, id, anchor] = requestedHash.split('/');
    const project = section === 'project' ? PROJECTS.find(item => item.id === id) : undefined;
    const route = project ? `project/${project.id}` : section === 'about' ? 'about' : 'work';
    setMenu(false, false, false);
    setHelp(false);
    if (!initial && route === currentRoute) {
      gallery.setEnabled(route === 'work');
      indexToggle.disabled = false;
      delete document.body.dataset.routeTransition;
      if (anchor === 'design') document.querySelector('#design-content')?.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      return;
    }
    const returning = route === 'work';
    const wasWork = currentRoute === 'work';
    // 点击当前盘保留眼前姿态和位置；直接链接或详情间导航才同步选择。
    if (project && (!wasWork || project.id !== gallery.selected.id)) gallery.selectProject(project.id, true);
    indexToggle.disabled = true;
    let committed = false;
    const update = () => {
      if (committed || controller.signal.aborted) return;
      committed = true;
      currentRoute = route;
      galleryElement.hidden = !returning;
      content.hidden = returning;
      document.body.classList.toggle('reading-page', !returning);
      document.body.dataset.route = route;
      content.getAnimations().forEach(animation => animation.cancel());
      content.innerHTML = returning ? '' : project ? projectPage(project) : aboutPage();
      if (!returning && !initial && !reducedMotion.matches) {
        content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DISC_TRANSITION.pageFade, easing: 'ease-out' });
      }
      document.title = `${project?.title ?? (route === 'about' ? '关于' : '作品')} — Old_glasses`;
      document.querySelectorAll<HTMLElement>('[data-nav]').forEach(link => {
        const active = link.dataset.nav === (route === 'about' ? 'about' : 'work');
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (!returning && !initial) content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
      if (anchor === 'design') document.querySelector('#design-content')?.scrollIntoView({ behavior: 'instant' });
    };
    try {
      if (!initial && wasWork && project) {
        document.body.dataset.routeTransition = 'exit';
        await gallery.transition('exit', update, controller.signal);
      } else if (!initial && returning && !wasWork) {
        document.body.dataset.routeTransition = 'enter';
        update();
        gallery.prepareReturn();
        await gallery.transition('enter', () => {}, controller.signal);
      } else update();
    } catch (error) {
      // 动画失败不能阻断导航；无 WebGL 设备也能打开完整详情。
      console.warn('光盘转场已回退为直接切页', error);
      update();
    } finally {
      if (generation === navigationId) {
        gallery.setEnabled(currentRoute === 'work');
        indexToggle.disabled = false;
        delete document.body.dataset.routeTransition;
        if (returning && !initial) galleryElement.querySelector<HTMLElement>('.disc-stage')?.focus({ preventScroll: true });
      }
    }
  })();
}

let toastTimer = 0;
content.addEventListener('click', async event => {
  if (!(event.target as Element).closest('.copy-handle')) return;
  const toast = document.querySelector<HTMLElement>('.toast')!;
  try {
    await navigator.clipboard.writeText(PROFILE.handle);
    toast.textContent = `已复制 ${PROFILE.handle}`;
  } catch {
    toast.textContent = `请手动复制：${PROFILE.handle}`;
  }
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
});
renderIndex();
window.addEventListener('hashchange', () => navigate());
navigate(true);
requestAnimationFrame(() => document.body.classList.add('is-ready'));
