import { PROFILE, PROJECTS, type Project } from './data';
import { discMarkup } from './disc';

export const ICONS = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 19 14-14M5 5h14v14" stroke="currentColor" stroke-width="1.3"/></svg>',
  glasses: '<svg viewBox="0 0 48 23" fill="none" aria-hidden="true"><path d="M3 5h16v7a8 8 0 0 1-16 0V5Zm26 0h16v7a8 8 0 0 1-16 0V5ZM19 9c3-3 7-3 10 0M1 5h3M44 5h3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

/** 完整详情页：上部留白与细线信息，下部是作品展示，最后接下一件作品。 */
export function projectPage(project: Project): string {
  const index = PROJECTS.indexOf(project);
  const next = PROJECTS[(index + 1) % PROJECTS.length];
  return `
    <article class="project-article" aria-labelledby="detail-title" style="--art-color:${project.color}">
      <section class="detail-hero">
        <a class="return-link" href="#work">← 返回作品</a>
        <div class="detail-heading">
          <span class="micro">SELECTED WORK / ${String(index + 1).padStart(2, '0')} — CONCEPT STUDY</span>
          <h1 id="detail-title" tabindex="-1">${project.title}</h1>
          <p>${project.subtitle}</p>
        </div>
        <dl class="detail-metadata">
          <div><dt>创作 / DESIGN</dt><dd>${PROFILE.name}</dd></div>
          <div><dt>年份 / YEAR</dt><dd>${project.year}</dd></div>
          <div><dt>领域 / DISCIPLINE</dt><dd>${project.tags.join(' / ')}</dd></div>
          <div><dt>项目 / PROJECT</dt><dd>${project.label} · 概念示例</dd></div>
        </dl>
        <a class="view-design" href="#project/${project.id}/design"><span>VIEW THE DESIGN</span><small>查看设计 ↓</small></a>
        <div class="detail-disc-entry">${discMarkup(project, index, true)}</div>
      </section>
      <section class="design-content" id="design-content">
        <div class="artwork-panel" aria-label="${project.label}视觉封面">${discMarkup(project, index, true)}<span class="artwork-caption">OG® — ${project.label}<span>${project.year}</span></span></div>
        <div class="project-story">
          <h2>${project.subtitle}</h2>
          <div><p>${project.description}</p><p>${project.approach}</p><small>概念示例 / 封面为原创程序视觉，待替换为真实作品。</small></div>
        </div>
      </section>
      <a class="next-project" href="#project/${next.id}"><span class="micro">继续浏览 / NEXT PROJECT</span><h2>${next.title}</h2>${ICONS.arrow}<span class="next-caption">${next.label}</span></a>
    </article>`;
}

export function aboutPage(): string {
  return `
    <article class="about-page" aria-labelledby="about-title">
      <a class="return-link" href="#work">← 返回作品</a>
      <header class="about-heading"><span class="micro">INDEPENDENT DESIGNER / SINCE 2016</span><h1 id="about-title" tabindex="-1">WITH CREATIVE<br><em>FROM HEART.</em></h1><p>${PROFILE.handle}</p></header>
      <div class="about-bio"><span class="micro">ABOUT / 关于我</span><div><h2>${PROFILE.intro}</h2><p>${PROFILE.bio}</p><p>动画、UI / UX、视频制作、平面设计。<br>为每一个好想法，找到合适的表达。</p></div></div>
      <div class="practice-list"><span>体验设计 <small>UI / UX DESIGN</small></span><span>动态影像 <small>MOTION & FILM</small></span><span>视觉创意 <small>VISUAL DESIGN</small></span></div>
      <div class="about-contact"><span class="micro">LET'S CREATE SOMETHING GOOD</span><h2>下一件好作品，<br>从一次对话开始。</h2><button class="copy-handle">${PROFILE.handle}<span>复制 ID ${ICONS.arrow}</span></button></div>
      <footer><span>© ${new Date().getFullYear()} ${PROFILE.name}</span><a href="#work">探索作品 ↗</a></footer>
    </article>`;
}
