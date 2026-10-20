import {
  CanvasTexture, EquirectangularReflectionMapping, MeshPhysicalMaterial,
  PMREMGenerator, Vector2, type WebGLRenderer,
} from 'three';
import { DISC_FINISH, DISC_LIGHTING } from './disc-config';
import { createDiscSurfaceMaps } from './disc-textures';

/** 在暗色环境上铺柔和的水平光带，反射保留灰阶，不把银环照成整块白色。 */
export function createDiscEnvironment(renderer: WebGLRenderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#25282f');
  background.addColorStop(.5, '#0e0f13');
  background.addColorStop(1, '#020203');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const band of DISC_LIGHTING.environmentBands) {
    const top = (band.latitude - band.width) * canvas.height;
    const height = band.width * canvas.height * 2;
    const glow = ctx.createLinearGradient(0, top, 0, top + height);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(.5, `rgba(255,255,255,${band.intensity})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, top, canvas.width, height);
  }
  const source = new CanvasTexture(canvas);
  // 这是线性灯光强度贴图；不按封面照片的 sRGB 再次压暗。
  source.mapping = EquirectangularReflectionMapping;
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(source);
  generator.dispose();
  source.dispose();
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
