import {
  ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Path, RingGeometry, Shape, type Material, type Texture,
} from 'three';
import { createCoverTexture, createDiscSurfaceMaps } from './disc-textures';
import type { Project } from './data';

export const DISC_3D = {
  holeRadius: .125,
  hubRadius: .22,
  thickness: .018,
  segments: 144,
  pixelRatioLimit: 1.75,
  dragRadiansPerDiameter: Math.PI * 2,
  inertiaDecay: .92,
  maxAngularSpeed: .065,
  flipDuration: 720,
};

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
  const shape = new Shape();
  shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
  const hole = new Path();
  hole.absarc(0, 0, DISC_3D.holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const shellGeometry = new ExtrudeGeometry(shape, {
    depth: DISC_3D.thickness, bevelEnabled: true, bevelSize: .0015,
    bevelThickness: .0015, bevelSegments: 2, steps: 1, curveSegments: DISC_3D.segments / 2,
  });
  shellGeometry.translate(0, 0, -DISC_3D.thickness / 2);
  const edge = new MeshStandardMaterial({ color: '#bec5c8', metalness: .95, roughness: .21 });
  const shell = new Mesh(shellGeometry, edge);
  shell.name = 'physical-edge';
  group.add(shell);

  const cover = createCoverTexture(project, index, onUpdate);
  const front = new Mesh(ring(DISC_3D.hubRadius, .993), new MeshStandardMaterial({
    map: cover, roughness: .55, metalness: .08, envMapIntensity: .35,
  }));
  front.name = 'printed-front';
  front.position.z = .011;
  group.add(front);

  const maps = createDiscSurfaceMaps();
  const silver = new MeshPhysicalMaterial({
    map: maps.color, metalness: 1, roughness: .29, roughnessMap: maps.roughness,
    iridescence: 1, iridescenceIOR: 1.42, iridescenceThicknessRange: [160, 480],
    iridescenceThicknessMap: maps.thickness, clearcoat: .85, clearcoatRoughness: .15,
    envMapIntensity: 1.2,
  });
  const back = new Mesh(ring(DISC_3D.hubRadius, .993), silver);
  back.name = 'reflective-back';
  back.rotation.y = Math.PI;
  back.position.z = -.011;
  group.add(back);

  const hubMaterial = new MeshPhysicalMaterial({
    color: '#cbd0d6', metalness: .64, roughness: .23, clearcoat: 1, envMapIntensity: .85,
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
  const textures: Texture[] = [cover, maps.color, maps.roughness, maps.thickness];
  return {
    group,
    dispose() {
      group.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}
