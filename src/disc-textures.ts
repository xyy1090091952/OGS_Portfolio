import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Project } from './data';
import { getCoverImage } from './preload-assets';

const RESOLUTION = 1024;

function canvas() {
  const element = document.createElement('canvas');
  element.width = element.height = RESOLUTION;
  const ctx = element.getContext('2d')!;
  ctx.scale(RESOLUTION / 1000, RESOLUTION / 1000);
  return { element, ctx };
}

/** 直接绘制印刷纹理，不把整个网页截图作为贴图，文字与素材仍来自同一份作品数据。 */
export function createCoverTexture(project: Project, index: number): CanvasTexture {
  const { element, ctx } = canvas();
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  const paintLabels = () => {
    const shade = ctx.createLinearGradient(0, 0, 0, 1000);
    shade.addColorStop(0, '#00000000');
    shade.addColorStop(.55, '#00000000');
    shade.addColorStop(1, '#00000050');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.fillStyle = project.ink;
    ctx.textAlign = 'left';
    ctx.font = '700 44px "DM Sans", sans-serif';
    ctx.fillText('OG®', 225, 180);
    ctx.font = '500 12px "DM Sans", sans-serif';
    ctx.fillText('DESIGN', 715, 166);
    ctx.fillText('ARCHIVE', 715, 185);
    ctx.font = '700 138px "DM Sans", sans-serif';
    project.lines.forEach((line, i) => ctx.fillText(line, 140 + i * 10, 742 + i * 117, 740));
    ctx.font = '400 12px "DM Sans", sans-serif';
    ctx.fillText(`VOL. ${String(index + 1).padStart(2, '0')} / ${project.year}`, 255, 925);
    ctx.textAlign = 'right';
    ctx.font = '400 9px "DM Sans", sans-serif';
    ctx.fillText('WITH CREATIVE FROM HEART', 760, 925);
    texture.needsUpdate = true;
  };
  ctx.fillStyle = project.color;
  ctx.fillRect(0, 0, 1000, 1000);
  const image = getCoverImage(project.image);
  if (image) {
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 1000, 1000);
  } else drawArtwork(ctx, project.artwork);
  // 字体与封面在建模前已经准备好，标签只绘制一次。
  paintLabels();
  return texture;
}

function drawArtwork(ctx: CanvasRenderingContext2D, artwork: Project['artwork']) {
  if (artwork === 'nature') {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(470 + i * 70, 385 + i * 60);
      ctx.rotate(-.65 + i * 1.3);
      const gradient = ctx.createLinearGradient(-200, -200, 230, 150);
      ['#eff4c4', '#b9ce83', '#384e26', '#e3edac', '#6d864b'].forEach((color, j) => gradient.addColorStop(j / 4, color));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-150, -330);
      ctx.bezierCurveTo(380, -170, 240, 70, 170, 400);
      ctx.bezierCurveTo(-280, 260, -80, -30, -150, -330);
      ctx.fill();
      ctx.restore();
    }
  } else if (artwork === 'motion') {
    const light = ctx.createRadialGradient(730, 140, 10, 500, 500, 750);
    light.addColorStop(0, '#f18661');
    light.addColorStop(1, '#7e100b');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.save();
    ctx.translate(585, 445);
    ctx.rotate(.65);
    const chrome = ctx.createLinearGradient(-240, 0, 240, 0);
    ['#151c20', '#b7cbd0', '#f9fcf0', '#3d515e', '#03090c', '#7b959b', '#fffef8', '#5f7376'].forEach((color, i) => chrome.addColorStop(i / 7, color));
    ctx.strokeStyle = chrome;
    ctx.lineWidth = 90;
    ctx.beginPath();
    ctx.ellipse(0, 0, 185, 395, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const glass = ctx.createRadialGradient(720, 210, 5, 680, 270, 205);
    glass.addColorStop(0, '#ffe3a4');
    glass.addColorStop(.08, '#e99a79');
    glass.addColorStop(.2, '#df6a47');
    glass.addColorStop(.65, '#a12b14');
    glass.addColorStop(.88, '#f3985d');
    glass.addColorStop(1, '#7a2814');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(680, 270, 190, 0, Math.PI * 2);
    ctx.fill();
  } else if (artwork === 'digital') {
    ctx.save();
    ctx.translate(500, 500);
    ctx.rotate(.43);
    for (let i = -5; i < 6; i++) {
      const x = i * 210;
      const fold = ctx.createLinearGradient(x, 0, x + 210, 0);
      ['#020f4e', '#2148b0', '#669cfc', '#2146af', '#050f52'].forEach((color, j) => fold.addColorStop(j / 4, color));
      ctx.fillStyle = fold;
      ctx.fillRect(x, -950, 212, 1900);
    }
    ctx.restore();
  } else if (artwork === 'film') {
    const sky = ctx.createLinearGradient(0, 0, 0, 1000);
    sky.addColorStop(0, '#d09a72');
    sky.addColorStop(1, '#f1d8ae');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.fillStyle = '#fff0cf';
    ctx.beginPath(); ctx.arc(680, 260, 120, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const dune = ctx.createLinearGradient(0, 420 + i * 130, 0, 1000);
      dune.addColorStop(0, '#f4d8a7'); dune.addColorStop(.4, '#c28c5b'); dune.addColorStop(1, '#754432');
      ctx.fillStyle = dune;
      ctx.beginPath(); ctx.moveTo(-200, 950 - i * 80);
      ctx.bezierCurveTo(250, 200 + i * 150, 500, 600 + i * 170, 1100, 330 + i * 230);
      ctx.lineTo(1100, 1100); ctx.lineTo(-200, 1100); ctx.fill();
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const x = 400 + i * 125, y = 270 + i * 190;
      const glass = ctx.createLinearGradient(x - 180, y - 210, x + 180, y + 210);
      ['#e5c5ff', '#594472', '#ecd5ff', '#7c60a1', '#ddaeff'].forEach((color, j) => glass.addColorStop(j / 4, color));
      ctx.strokeStyle = glass; ctx.lineWidth = 65;
      ctx.beginPath(); ctx.ellipse(x, y, 170, 220, -.5 + i * .4, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

/** 印刷覆膜的微小起伏和粗糙度分开保存，不把高光烘焙到封面颜色里。 */
export function createPrintSurfaceMaps() {
  const size = 512;
  const normal = document.createElement('canvas');
  const roughness = document.createElement('canvas');
  normal.width = normal.height = roughness.width = roughness.height = size;
  const normalContext = normal.getContext('2d')!;
  const roughContext = roughness.getContext('2d')!;
  const normals = normalContext.createImageData(size, size);
  const rough = roughContext.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 固定种子的整型噪声，刷新或重新创建场景时纹理保持一致。
      const seed = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
      const noise = ((Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0) % 1024) / 1023;
      const i = (y * size + x) * 4;
      normals.data[i] = 128 + (noise - .5) * 18;
      normals.data[i + 1] = 128 + (noise - .5) * 12;
      normals.data[i + 2] = 255;
      normals.data[i + 3] = 255;
      const value = 190 + noise * 35;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = value;
      rough.data[i + 3] = 255;
    }
  }
  normalContext.putImageData(normals, 0, 0);
  roughContext.putImageData(rough, 0, 0);
  return { normal: new CanvasTexture(normal), roughness: new CanvasTexture(roughness) };
}

/** 背面纹理只有细密沟槽；随视角变化的彩虹和高光由三维材质计算。 */
export function createDiscSurfaceMaps() {
  const { element, ctx } = canvas();
  const { element: roughness, ctx: rough } = canvas();
  const { element: direction, ctx: directionContext } = canvas();
  const { element: normal, ctx: normalContext } = canvas();
  ctx.fillStyle = '#e4e6e9'; ctx.fillRect(0, 0, 1000, 1000);
  rough.fillStyle = '#b3b3b3'; rough.fillRect(0, 0, 1000, 1000);
  // R/G 保存沟槽切线方向，B 保存强度；这是一张数据贴图，不含可见的彩虹颜色。
  const directionPixels = directionContext.createImageData(RESOLUTION, RESOLUTION);
  const normalPixels = normalContext.createImageData(RESOLUTION, RESOLUTION);
  for (let y = 0; y < RESOLUTION; y++) {
    for (let x = 0; x < RESOLUTION; x++) {
      const dx = x - RESOLUTION / 2, dy = RESOLUTION / 2 - y;
      const radius = Math.max(1, Math.hypot(dx, dy));
      const i = (y * RESOLUTION + x) * 4;
      directionPixels.data[i] = Math.round((1 - dy / radius) * 127.5);
      directionPixels.data[i + 1] = Math.round((1 + dx / radius) * 127.5);
      directionPixels.data[i + 2] = 255;
      directionPixels.data[i + 3] = 255;
      const grooveSlope = Math.sin(radius * .65) * .065 + Math.sin(radius * 2.1) * .022;
      normalPixels.data[i] = 128 + dx / radius * grooveSlope * 127;
      normalPixels.data[i + 1] = 128 + dy / radius * grooveSlope * 127;
      normalPixels.data[i + 2] = 255;
      normalPixels.data[i + 3] = 255;
    }
  }
  directionContext.putImageData(directionPixels, 0, 0);
  normalContext.putImageData(normalPixels, 0, 0);
  for (let radius = 122; radius < 491; radius += 1.4) {
    ctx.strokeStyle = radius % 5 < 2 ? '#f7faff09' : '#20292d06';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.arc(500, 500, radius, 0, Math.PI * 2); ctx.stroke();
    rough.strokeStyle = '#ffffff1a'; rough.lineWidth = .5;
    rough.beginPath(); rough.arc(500, 500, radius, 0, Math.PI * 2); rough.stroke();
  }
  const color = new CanvasTexture(element);
  color.colorSpace = SRGBColorSpace;
  return { color, roughness: new CanvasTexture(roughness), direction: new CanvasTexture(direction), normal: new CanvasTexture(normal) };
}
