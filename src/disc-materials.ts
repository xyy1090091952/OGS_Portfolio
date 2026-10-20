import {
  Color, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PlaneGeometry,
  PMREMGenerator, Scene, Vector2, type WebGLRenderer,
} from 'three';
import { DISC_FINISH } from './disc-config';
import { createDiscSurfaceMaps } from './disc-textures';

/** 摄影棚长条柔光板：反光要有明暗和形状，才能读出光盘的弧度与薄边。 */
export function createDiscEnvironment(renderer: WebGLRenderer) {
  const studio = new Scene();
  studio.background = new Color('#30343b');
  const panels: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  const addPanel = (x: number, y: number, z: number, width: number, height: number, power: number) => {
    const panel = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({
      color: new Color('#ffffff').multiplyScalar(power),
    }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    panels.push(panel);
    studio.add(panel);
  };
  addPanel(-3, 3, 5, 3, 7, 4);
  addPanel(4, 1, 3, .8, 6, 3);
  addPanel(0, -4, 2, 7, 1.3, 2);
  addPanel(-2, 2, -5, 4, 5, 2);
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(studio, .035);
  generator.dispose();
  panels.forEach(panel => { panel.geometry.dispose(); panel.material.dispose(); });
  return target;
}

/** 银底负责真实环境反射，径向沟槽负责拉长高光，衍射色只出现在局部光带。 */
export function createSilverFinish() {
  const maps = createDiscSurfaceMaps();
  const material = new MeshPhysicalMaterial({
    map: maps.color,
    metalness: 1,
    roughness: DISC_FINISH.silverRoughness,
    roughnessMap: maps.roughness,
    normalMap: maps.normal,
    normalScale: new Vector2(.4, .4),
    anisotropy: DISC_FINISH.silverAnisotropy,
    anisotropyMap: maps.direction,
    iridescence: DISC_FINISH.silverIridescence,
    iridescenceIOR: 1.36,
    iridescenceThicknessRange: [300, 340],
    clearcoat: .35,
    clearcoatRoughness: .15,
    envMapIntensity: DISC_FINISH.environmentIntensity,
  });
  // 薄膜虹彩与 CD 沟槽衍射不同。这里额外模拟两束径向色散，
  // 用世界坐标的观察方向计算，使颜色在旋转时移动，而不是贴在盘面上。
  material.onBeforeCompile = shader => {
    shader.uniforms.discDiffraction = { value: DISC_FINISH.diffractionStrength };
    const varyings = `
      varying vec2 vDiscPosition;
      varying vec3 vDiscWorld;
      varying vec3 vDiscAxisX;
      varying vec3 vDiscAxisY;
    `;
    shader.vertexShader = varyings + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vDiscPosition = position.xy;
      vDiscWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vDiscAxisX = normalize(modelMatrix[0].xyz);
      vDiscAxisY = normalize(modelMatrix[1].xyz);
    `);
    shader.fragmentShader = `uniform float discDiffraction;\n${varyings}` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 discView = normalize(cameraPosition - vDiscWorld);
      vec3 discHalf = normalize(discView + normalize(vec3(-0.5, 0.7, 1.0)));
      vec2 discLight = vec2(dot(discHalf, vDiscAxisX), dot(discHalf, vDiscAxisY));
      vec2 discRadial = normalize(vDiscPosition + vec2(0.0001));
      float discAlignment = dot(discRadial, normalize(discLight + vec2(0.0001)));
      float discBand = pow(abs(discAlignment), 16.0);
      float discPhase = discAlignment * 2.5 + length(discLight) * 7.0 + length(vDiscPosition) * 0.3;
      vec3 discSpectrum = 0.5 + 0.5 * cos(6.28318 * (discPhase + vec3(0.0, 0.33, 0.67)));
      float discEdgeFade = smoothstep(0.22, 0.28, length(vDiscPosition));
      outgoingLight += discSpectrum * discBand * discEdgeFade * discDiffraction;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'disc-diffraction-v1';
  return { material, textures: [maps.color, maps.roughness, maps.direction, maps.normal] };
}
