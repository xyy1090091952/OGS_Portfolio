import { PROJECTS, type Project } from './data';
import { aboutPage, projectPage } from './pages';

const pages = new Map<string, string>();

/** 预先生成全部详情，路由切换只取缓存；内容仍统一来自 data.ts。 */
export function preloadPages() {
  PROJECTS.forEach(project => pages.set(project.id, projectPage(project)));
  pages.set('about', aboutPage());
}

export function getPageContent(project?: Project) {
  const key = project?.id ?? 'about';
  return pages.get(key) ?? (project ? projectPage(project) : aboutPage());
}
