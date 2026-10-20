import {
  Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  RingGeometry, Vector2, type Material, type Texture,
} from 'three';
import { createCoverTexture, createPrintSurfaceMaps } from './disc-textures';
import { DISC_3D, DISC_FINISH } from './disc-config';
import { createSilverFinish } from './disc-materials';
import { createDiscShell } from './disc-geometry';
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
export function createDiscModel(project: Project, index: number, onUpdate: () => void): DiscModel {
  const group = new Group();
  group.name = `disc-${project.id}`;
  group.userData.projectId = project.id;
  const shellGeometry = createDiscShell();
  const edge = new MeshStandardMaterial({ color: '#bec5c8', metalness: .95, roughness: .21 });
  const shell = new Mesh(shellGeometry, edge);
  shell.name = 'physical-edge';
  group.add(shell);

  const cover = createCoverTexture(project, index, onUpdate);
  const printMaps = createPrintSurfaceMaps();
  const front = new Mesh(ring(DISC_3D.hubRadius, .993), new MeshPhysicalMaterial({
    map: cover, roughness: DISC_FINISH.printRoughness, metalness: DISC_FINISH.printMetalness,
    normalMap: printMaps.normal, normalScale: new Vector2(.3, .3), roughnessMap: printMaps.roughness,
    clearcoat: DISC_FINISH.printClearcoat, clearcoatRoughness: .2,
    envMapIntensity: .45,
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

  const hubMaterial = new MeshPhysicalMaterial({
    color: '#e5e9ed', metalness: .05, roughness: .3, clearcoat: .6, envMapIntensity: .9,
    transmission: .65, thickness: .012, ior: 1.5,
  });
  const materials: Material[] = [edge, front.material, silver, hubMaterial];
  for (const sign of [-1, 1]) {
    const hub = new Mesh(ring(DISC_3D.holeRadius, DISC_3D.hubRadius), hubMaterial);
    hub.name = 'center-hub';
    hub.position.z = sign * .012;
    if (sign < 0) hub.rotation.y = Math.PI;
    group.add(hub);
    for (const [inner, outer] of [[.139, .142], [.193, .196], [.217, .222], [.978, .983]]) {
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
