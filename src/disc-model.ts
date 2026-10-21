import {
  Group, Mesh, MeshPhysicalMaterial,
  RingGeometry, Vector2, type Material, type Texture,
} from 'three';
import { createCoverTexture, createPrintSurfaceMaps } from './disc-textures';
import { DISC_3D, DISC_FINISH, DISC_HUB } from './disc-config';
import { createSilverFinish } from './disc-materials';
import { createDiscShell, createHubBand } from './disc-geometry';
import type { Project } from './data';

function ring(inner: number, outer: number) {
  const geometry = new RingGeometry(inner, outer, DISC_3D.segments);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  // 将纹理固定在整张光盘上：翻面时，文字、纹理与光盘一起旋转。
  for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 2 + .5, positions.getY(i) / 2 + .5);
  return geometry;
}

export interface DiscModel {
  group: Group;
  dispose(): void;
}

/** 带真实中心孔的实体模型；正面、背面与侧边分别赋材质，不用镜像封面冒充背面。 */
export function createDiscModel(project: Project, index: number): DiscModel {
  const group = new Group();
  group.name = `disc-${project.id}`;
  group.userData.projectId = project.id;
  const shellGeometry = createDiscShell();
  const edge = new MeshPhysicalMaterial({
    color: '#c9cfd1', metalness: DISC_FINISH.edgeMetalness, roughness: DISC_FINISH.edgeRoughness,
    clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: 1,
  });
  const shell = new Mesh(shellGeometry, edge);
  shell.name = 'physical-edge';
  group.add(shell);

  const cover = createCoverTexture(project, index);
  const printMaps = createPrintSurfaceMaps();
  const front = new Mesh(ring(DISC_3D.hubRadius, .993), new MeshPhysicalMaterial({
    map: cover, roughness: DISC_FINISH.printRoughness, metalness: DISC_FINISH.printMetalness,
    normalMap: printMaps.normal, normalScale: new Vector2(.3, .3), roughnessMap: printMaps.roughness,
    clearcoat: DISC_FINISH.printClearcoat, clearcoatRoughness: .2,
    envMapIntensity: DISC_FINISH.printEnvironment,
  }));
  front.name = 'printed-front';
  front.position.z = .011;
  group.add(front);

  const { material: silver, textures: silverTextures } = createSilverFinish();
  const back = new Mesh(ring(DISC_3D.hubRadius, .993), silver);
  back.name = 'reflective-back';
  back.rotation.y = Math.PI;
  back.position.z = -.011;
  group.add(back);

  const frost = new MeshPhysicalMaterial({
    color: '#bdc3c7', metalness: .18, roughness: .46, clearcoat: .35,
    transmission: .25, thickness: .025, ior: 1.5, envMapIntensity: .8,
  });
  const matrix = new MeshPhysicalMaterial({
    color: '#bec3c7', metalness: .82, roughness: .28, clearcoat: .55,
    clearcoatRoughness: .16, envMapIntensity: 1.15,
  });
  const polycarbonate = new MeshPhysicalMaterial({
    color: '#dbe0e4', metalness: .06, roughness: .38, clearcoat: .7,
    transmission: .68, thickness: .025, ior: 2, envMapIntensity: .85,
  });
  const materials: Material[] = [edge, front.material, silver, frost, matrix, polycarbonate];
  // 三个连续实体环：磨砂孔壁、金属压片环、外侧透明聚碳酸酯。
  for (const [name, inner, outer, material] of [
    ['frost-hub', DISC_3D.holeRadius, DISC_HUB.frostOuter, frost],
    ['matrix-hub', DISC_HUB.frostOuter, DISC_HUB.matrixOuter, matrix],
    ['clear-hub', DISC_HUB.matrixOuter, DISC_3D.hubRadius, polycarbonate],
  ] as const) {
    const hub = new Mesh(createHubBand(inner, outer), material);
    hub.name = name;
    group.add(hub);
  }
  for (const sign of [-1, 1]) {
    // 只留外缘的一道细银线，中心的层次交由真实曲面产生。
    for (const [inner, outer] of [[.985, .988]]) {
      const groove = new Mesh(ring(inner, outer), edge);
      groove.position.z = sign * .013;
      if (sign < 0) groove.rotation.y = Math.PI;
      group.add(groove);
    }
  }
  const textures: Texture[] = [cover, printMaps.normal, printMaps.roughness, ...silverTextures];
  return {
    group,
    dispose() {
      group.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}
