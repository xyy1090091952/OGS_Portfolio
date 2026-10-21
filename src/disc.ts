import type { Project } from './data';
import { getCoverImage } from './preload-assets';

/** 光盘是可聚焦的原生按钮；金属环、反光和印刷层各自独立，方便调整材质。 */
export function discMarkup(project: Project, index: number, decorative = false): string {
  const image = getCoverImage(project.image);
  const contents = `
    <span class="disc-physical" style="--disc-color:${project.color};--disc-ink:${project.ink}">
      <span class="disc-print">
        ${image ? `<img src="${image.src}" crossorigin="anonymous" alt="" draggable="false" />` : `<span class="cover-art art-${project.artwork}" aria-hidden="true"><span class="art-form form-a"></span><span class="art-form form-b"></span><span class="art-form form-c"></span><span class="art-grain"></span></span>`}
        <span class="disc-vignette"></span>
        <span class="disc-brand">OG® <span>DESIGN ARCHIVE</span></span>
        <span class="disc-title"><span>${project.lines[0]}</span><span>${project.lines[1]}</span></span>
        <span class="disc-edition">VOL. ${String(index + 1).padStart(2, '0')} · ${project.year} <span>CREATED FROM HEART</span></span>
        <span class="disc-sheen"></span>
      </span>
      <span class="disc-hub"><span></span></span>
    </span>`;
  return decorative
    ? `<div class="detail-disc" aria-hidden="true">${contents}</div>`
    : `<button class="disc" data-project="${project.id}" aria-label="查看${project.label}，${project.title}">${contents}<span class="disc-open">探索作品 ↗</span></button>`;
}
