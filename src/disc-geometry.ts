import { LatheGeometry, Vector2 } from 'three';
import { DISC_3D } from './disc-config';

/**
 * 把带圆角的截面旋转一周，生成连续的光盘侧壁。
 * 法线直接来自圆弧方向，避免挤出几何按面片计算法线造成一节一节的高光。
 */
export function createDiscShell() {
  const bevel = DISC_3D.edgeBevel;
  const half = DISC_3D.thickness / 2;
  const inner = DISC_3D.hubRadius;
  const profile: Vector2[] = [new Vector2(inner + bevel, -half - bevel)];
  const profileNormals: Vector2[] = [new Vector2(0, -1)];
  const addCorner = (radius: number, height: number, start: number) => {
    for (let i = 0; i <= DISC_3D.edgeBevelSegments; i++) {
      const angle = start + i / DISC_3D.edgeBevelSegments * Math.PI / 2;
      const radial = Math.cos(angle), axial = Math.sin(angle);
      profile.push(new Vector2(radius + radial * bevel, height + axial * bevel));
      profileNormals.push(new Vector2(radial, axial));
    }
  };
  // 从底面绕截面一周：外侧下圆角、上圆角、内孔上圆角、下圆角。
  // 银层止于透明中心环，保持真实中心孔与之前一致。
  addCorner(1, -half, -Math.PI / 2);
  addCorner(1, half, 0);
  addCorner(inner + bevel, half, Math.PI / 2);
  addCorner(inner + bevel, -half, Math.PI);

  const geometry = new LatheGeometry(profile, DISC_3D.segments);
  const normals = geometry.getAttribute('normal');
  for (let segment = 0; segment <= DISC_3D.segments; segment++) {
    const angle = segment / DISC_3D.segments * Math.PI * 2;
    profileNormals.forEach((normal, row) => {
      // 圆周接缝两端使用同一方向，侧壁与圆角连接处也具有连续切线。
      normals.setXYZ(segment * profile.length + row,
        normal.x * Math.sin(angle), normal.y, normal.x * Math.cos(angle));
    });
  }
  // Three.js 默认绕 Y 轴旋转；光盘正反面沿本项目的 Z 轴放置。
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
