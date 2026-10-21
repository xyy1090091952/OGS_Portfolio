/** 启动阶段集中配置；进度按实际完成的准备任务累计，不使用随机百分比。 */
export const LOADING = {
  minimumVisible: 500,
  completeHold: 160,
  exitDuration: 360,
  resourceTimeout: 5000,
  sceneTimeout: 8000,
  fonts: [
    { family: 'Bodoni Moda', source: '/fonts/bodoni-moda-latin.woff2', weight: '400' },
    { family: 'DM Sans', source: '/fonts/dm-sans-latin.woff2', weight: '400 700' },
  ],
  tasks: {
    fonts: { weight: 15, label: '准备文字' },
    covers: { weight: 15, label: '整理作品封面' },
    pages: { weight: 10, label: '准备作品资料' },
    module: { weight: 15, label: '准备展示' },
    models: { weight: 20, label: '整理光盘' },
    render: { weight: 25, label: '准备入场' },
  },
} as const;

export type LoadingTask = keyof typeof LOADING.tasks;
export type LoadingReporter = (task: LoadingTask) => void;

/** 网络或图形驱动不能无限阻塞首页；超时后由调用方选择可用的回退。 */
export function withDeadline<T>(promise: Promise<T>, duration: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('资源准备超时')), duration);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
