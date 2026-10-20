import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { DISC_OUTLINE } from './disc-config';

type OutlineState = 'hidden' | 'in' | 'on' | 'out';
const FRAME_MS = 1000 / DISC_OUTLINE.framesPerSecond;

/** 环线由有宽度的三维笔触构成：有笔锋和自然断口，也会被前方光盘正确挡住。 */
export class DiscHighlight {
  readonly group = new Group();
  private material = new MeshBasicMaterial({ color: '#080808', side: DoubleSide, depthWrite: false, toneMapped: false });
  private ribbons: BufferGeometry[] = [];
  private timer = 0;
  private model: Group | null = null;
  private state: OutlineState = 'hidden';
  private frame = 0;
  private nextSample = 0;
  private seed = 8137;

  constructor(private wake: () => void) {
    this.group.name = 'hover-ink';
    this.group.matrixAutoUpdate = false;
    for (let loop = 0; loop < DISC_OUTLINE.loops; loop++) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array((DISC_OUTLINE.segments + 1) * 6), 3));
      const indices: number[] = [];
      for (let i = 0; i < DISC_OUTLINE.segments; i++) {
        const vertex = i * 2;
        indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
      geometry.setIndex(indices);
      const mesh = new Mesh(geometry, this.material);
      // 深度测试保持开启，排序仅确保先完成光盘本身的深度写入。
      mesh.renderOrder = 900;
      mesh.frustumCulled = false;
      this.ribbons.push(geometry);
      this.group.add(mesh);
    }
    this.hide();
  }

  hide() {
    this.group.visible = false;
    this.model = null;
    this.state = 'hidden';
    clearTimeout(this.timer);
    this.timer = 0;
  }

  update(target: Group | null, now: number) {
    if (target && (this.model !== target || this.state === 'out' || this.state === 'hidden')) {
      this.model = target;
      this.state = 'in';
      this.frame = 0;
      this.nextSample = now;
    } else if (!target && this.state !== 'hidden' && this.state !== 'out') {
      this.state = 'out';
      this.frame = 0;
      this.nextSample = now;
    }
    if (!this.model || this.state === 'hidden') return;
    // 与实体光盘使用同一世界变换，翻面、缩放与深度分层都保持一致。
    this.group.matrix.copy(this.model.matrixWorld);
    this.group.visible = true;
    if (now >= this.nextSample) {
      const sequence = this.state === 'in' ? DISC_OUTLINE.entrance : this.state === 'out' ? DISC_OUTLINE.exit : [1];
      if (this.state === 'out' && this.frame >= sequence.length) { this.hide(); return; }
      this.draw(sequence[Math.min(this.frame, sequence.length - 1)]);
      this.frame++;
      if (this.state === 'in' && this.frame >= sequence.length) this.state = 'on';
      this.nextSample = now + FRAME_MS;
    }
    this.schedule(now);
  }

  private schedule(now: number) {
    if (this.timer || !this.model) return;
    // 只有悬停和短暂退场时按 10fps 请求绘制，移开后停止。
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.wake();
    }, Math.max(1, this.nextSample - now));
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private draw(reveal: number) {
    this.ribbons.forEach((geometry, loop) => {
      const positions = geometry.getAttribute('position');
      const radius = 1 + DISC_OUTLINE.padding + loop * DISC_OUTLINE.loopGap;
      const start = this.random() * Math.PI * 2;
      const sweep = DISC_OUTLINE.sweep * (1 + (this.random() - .5) * DISC_OUTLINE.sweepJitter) * reveal;
      const jitter = Array.from({ length: DISC_OUTLINE.controlPoints + 2 }, () => (this.random() * 2 - 1) * DISC_OUTLINE.jitter);
      for (let i = 0; i <= DISC_OUTLINE.segments; i++) {
        const t = i / DISC_OUTLINE.segments;
        const angle = start + t * Math.PI * 2 * sweep;
        const location = t * DISC_OUTLINE.controlPoints * sweep;
        const index = Math.floor(location), fraction = location - index;
        const smooth = fraction * fraction * (3 - 2 * fraction);
        const wobble = jitter[index] * (1 - smooth) + jitter[index + 1] * smooth;
        const pressure = Math.min(1, Math.min(t, 1 - t) * 14 + .08);
        const halfWidth = DISC_OUTLINE.width * .5 * pressure * (1 + Math.sin(t * 9 + loop) * .12);
        for (let edge = 0; edge < 2; edge++) {
          const r = radius * (1 + wobble) + (edge ? halfWidth : -halfWidth);
          positions.setXYZ(i * 2 + edge, Math.cos(angle) * r, Math.sin(angle) * r, 0);
        }
      }
      positions.needsUpdate = true;
    });
  }

  dispose() {
    this.hide();
    this.ribbons.forEach(geometry => geometry.dispose());
    this.material.dispose();
    this.group.removeFromParent();
  }
}
