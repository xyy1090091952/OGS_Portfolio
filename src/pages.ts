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
      <section class="detail-hero" data-reveal-hero>
        <a class="return-link" href="#work"><span data-reveal="text">← 返回作品</span></a>
        <div class="detail-summary">
          <div class="detail-heading">
            <h1 id="detail-title" tabindex="-1" aria-label="${project.title}">${project.lines.map(line => `<span data-reveal="title">${line}</span>`).join('')}</h1>
            <i class="motion-rule" data-reveal="rule" aria-hidden="true"></i>
            <div class="detail-credits">
              <span class="micro" data-reveal="text">SELECTED WORK / ${String(index + 1).padStart(2, '0')} — CONCEPT STUDY</span>
              <p data-reveal="text">${project.subtitle}</p>
            </div>
          </div>
          <dl class="detail-metadata">
            <div><dt><i class="motion-rule" data-reveal="rule" aria-hidden="true"></i><span data-reveal="text">创作 / DESIGN</span></dt><dd data-reveal="text">${PROFILE.name}</dd></div>
            <div><dt><i class="motion-rule" data-reveal="rule" aria-hidden="true"></i><span data-reveal="text">年份 / YEAR</span></dt><dd data-reveal="text">${project.year}</dd></div>
            <div><dt><i class="motion-rule" data-reveal="rule" aria-hidden="true"></i><span data-reveal="text">领域 / DISCIPLINE</span></dt><dd data-reveal="text">${project.tags.join(' / ')}</dd></div>
            <div><dt><i class="motion-rule" data-reveal="rule" aria-hidden="true"></i><span data-reveal="text">项目 / PROJECT</span></dt><dd data-reveal="text">${project.label} · 概念示例</dd></div>
          </dl>
          <i class="motion-rule detail-last-rule" data-reveal="rule" aria-hidden="true"></i>
        </div>
        <div class="detail-action">
          ${Array.from({ length: 4 }, () => '<span class="detail-corner" data-reveal="corner" aria-hidden="true">+</span>').join('')}
          <a class="view-design" href="#project/${project.id}/design">
            <span class="view-design-label"><i class="motion-rule" data-reveal="button-rule" aria-hidden="true"></i><span data-reveal="button-text">VIEW THE DESIGN</span><i class="motion-rule rule-bottom" data-reveal="button-rule" aria-hidden="true"></i></span>
            <small data-reveal="button-text">查看设计 ↓</small>
          </a>
        </div>
      </section>
      <section class="design-content" id="design-content">
        <div class="artwork-panel" data-reveal-scroll aria-label="${project.label}视觉封面">${discMarkup(project, index, true)}<span class="artwork-caption">OG® — ${project.label}<span>${project.year}</span></span></div>
        <div class="project-story" data-reveal-scroll>
          <h2 data-reveal="title">${project.subtitle}</h2>
          <div><p data-reveal="text">${project.description}</p><p data-reveal="text">${project.approach}</p><small data-reveal="text">概念示例 / 封面为原创程序视觉，待替换为真实作品。</small></div>
        </div>
      </section>
      <a class="next-project" data-reveal-scroll href="#project/${next.id}"><span class="micro" data-reveal="text">继续浏览 / NEXT PROJECT</span><h2 data-reveal="title">${next.title}</h2>${ICONS.arrow}<span class="next-caption" data-reveal="text">${next.label}</span></a>
    </article>`;
}

export function aboutPage(): string {
  return `
    <article class="about-page" aria-labelledby="about-title">
      <a class="return-link" href="#work">← 返回作品</a>
      <header class="about-heading" data-reveal-hero><span class="micro" data-reveal="text">INDEPENDENT DESIGNER / SINCE 2016</span><h1 id="about-title" tabindex="-1" data-reveal="title">WITH CREATIVE<br><em>FROM HEART.</em></h1><p data-reveal="text">${PROFILE.handle}</p></header>
      <div class="about-bio"><span class="micro">ABOUT / 关于我</span><div><h2>${PROFILE.intro}</h2><p>${PROFILE.bio}</p><p>动画、UI / UX、视频制作、平面设计。<br>为每一个好想法，找到合适的表达。</p></div></div>
      <div class="practice-list"><span>体验设计 <small>UI / UX DESIGN</small></span><span>动态影像 <small>MOTION & FILM</small></span><span>视觉创意 <small>VISUAL DESIGN</small></span></div>
      <div class="about-contact"><span class="micro">LET'S CREATE SOMETHING GOOD</span><h2>下一件好作品，<br>从一次对话开始。</h2><button class="copy-handle">${PROFILE.handle}<span>复制 ID ${ICONS.arrow}</span></button></div>
      <footer><span>© ${new Date().getFullYear()} ${PROFILE.name}</span><a href="#work">探索作品 ↗</a></footer>
    </article>`;
}
