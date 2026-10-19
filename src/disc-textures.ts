import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Project } from './data';

const RESOLUTION = 1024;

function canvas() {
  const element = document.createElement('canvas');
  element.width = element.height = RESOLUTION;
  const ctx = element.getContext('2d')!;
  ctx.scale(RESOLUTION / 1000, RESOLUTION / 1000);
  return { element, ctx };
}

/** 直接绘制印刷纹理，不把整个网页截图作为贴图，文字与素材仍来自同一份作品数据。 */
export function createCoverTexture(project: Project, index: number, onUpdate: () => void): CanvasTexture {
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
  drawArtwork(ctx, project.artwork);
  paintLabels();
  if (project.image) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 1000, 1000);
      paintLabels();
      // 场景静止时不持续渲染；图片加载完成后主动请求一帧更新封面。
      onUpdate();
    };
    image.src = project.image;
  }
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

/** 背面纹理只有细密沟槽；随视角变化的彩虹和高光由三维材质计算。 */
export function createDiscSurfaceMaps() {
  const { element, ctx } = canvas();
  const { element: roughness, ctx: rough } = canvas();
  const { element: thickness, ctx: film } = canvas();
  ctx.fillStyle = '#c4c9cd'; ctx.fillRect(0, 0, 1000, 1000);
  rough.fillStyle = '#454545'; rough.fillRect(0, 0, 1000, 1000);
  const gradient = film.createRadialGradient(500, 500, 100, 500, 500, 500);
  gradient.addColorStop(0, '#222'); gradient.addColorStop(.2, '#777'); gradient.addColorStop(.7, '#ddd'); gradient.addColorStop(1, '#888');
  film.fillStyle = gradient; film.fillRect(0, 0, 1000, 1000);
  for (let radius = 122; radius < 491; radius += 1.4) {
    ctx.strokeStyle = radius % 5 < 2 ? '#f7faff12' : '#20292d10';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.arc(500, 500, radius, 0, Math.PI * 2); ctx.stroke();
    rough.strokeStyle = '#ffffff1a'; rough.lineWidth = .5;
    rough.beginPath(); rough.arc(500, 500, radius, 0, Math.PI * 2); rough.stroke();
  }
  const color = new CanvasTexture(element);
  color.colorSpace = SRGBColorSpace;
  return { color, roughness: new CanvasTexture(roughness), thickness: new CanvasTexture(thickness) };
}
