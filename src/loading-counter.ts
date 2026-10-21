import { LOADING } from './loading-config';
import { outQuart, unit } from './disc-opening';

interface Cell {
  element: HTMLElement;
  shell: HTMLElement;
  drum: HTMLElement;
  letter: boolean;
  index: number;
  width: number;
  row: number;
  fromWidth: number;
  toWidth: number;
  fromRow: number;
  toRow: number;
}

/** 用遮罩内的数字卷轴实现滚字，所有字位由 Loading 的同一帧驱动。 */
export class LoadingCounter {
  private cells: Cell[] = [];
  private started = 0;
  private duration = 0;
  private exit = -1;
  private value = '';

  constructor(private root: HTMLElement, digits = 3, brand: string = LOADING.brand) {
    root.replaceChildren();
    const letters = [...brand];
    [...letters, ...Array.from({ length: digits }, () => '')].forEach((character, index) => {
      const letter = index < letters.length;
      const element = document.createElement('span');
      element.className = 'loader-cell';
      const shell = document.createElement('span');
      shell.className = 'loader-cell-shell';
      const drum = document.createElement('span');
      drum.className = 'loader-drum';
      const rows = letter ? [character] : Array.from({ length: 20 }, (_, row) => String(row % 10));
      rows.forEach(text => {
        const row = document.createElement('span');
        row.textContent = text;
        drum.append(row);
      });
      shell.append(drum);
      element.append(shell);
      root.append(element);
      this.cells.push({
        element, shell, drum, letter, index: letter ? index : index - letters.length,
        width: 0, row: -1, fromWidth: 0, toWidth: 0, fromRow: -1, toRow: -1,
      });
    });
  }

  set(value: string, now: number, duration: number) {
    if (value === this.value) return;
    this.draw(now);
    const numeric = /^\d+$/.test(value);
    const digitCount = this.cells.filter(cell => !cell.letter).length;
    this.cells.forEach(cell => {
      const character = cell.letter ? value[cell.index] : value.padStart(digitCount, ' ')[cell.index];
      const visible = cell.letter ? !numeric && !!character : numeric && character !== ' ';
      cell.fromWidth = cell.width;
      cell.toWidth = visible ? cell.letter ? .76 : .56 : 0;
      // 最初的 0 只向上滑入，不从窄缝横向挤出。
      if (!this.value && visible) cell.fromWidth = cell.toWidth;
      // 卷轴跨过 9 后回到第二轮数字；归一化不改变眼前的字形。
      if (!cell.letter && cell.row >= 10) cell.row -= 10;
      cell.fromRow = cell.row;
      cell.toRow = cell.letter ? visible ? 0 : 1
        : visible ? Number(character) + (cell.row >= 0 ? 10 : 0) : cell.row + 1;
    });
    this.started = now;
    this.duration = duration;
    this.value = value;
    this.root.dataset.value = value;
  }

  /** 按字位错峰向上退出，和主盘放大同时发生。 */
  leave(progress: number) { this.exit = progress; }

  draw(now: number) {
    this.cells.forEach((cell, index) => {
      const elapsed = now - this.started - cell.index * LOADING.digitStagger;
      const t = this.duration ? outQuart(elapsed / this.duration) : 1;
      cell.width = cell.fromWidth + (cell.toWidth - cell.fromWidth) * t;
      cell.row = cell.fromRow + (cell.toRow - cell.fromRow) * t;
      cell.element.style.width = `${cell.width}em`;
      cell.drum.style.transform = `translateY(${-cell.row}em)`;
      const activeIndex = this.cells.slice(0, index).filter(item => item.toWidth > 0).length;
      const lift = this.exit < 0 ? 0 : unit((this.exit - activeIndex * LOADING.digitExitStagger) / .7);
      cell.shell.style.transform = `translateY(${-110 * outQuart(lift)}%)`;
    });
  }
}
