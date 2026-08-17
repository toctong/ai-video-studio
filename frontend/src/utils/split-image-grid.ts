/** 将图片按 rows×cols 裁切为 blob 列表（从左到右、从上到下） */

export type GridCellBlob = {
  row: number;
  col: number;
  index: number;
  blob: Blob;
  filename: string;
  /** 裁切像素宽高，用于画布缩略展示比例 */
  pixelW: number;
  pixelH: number;
};

/** 切分组节点内保存的小图单元（单个图像节点展示，非多个画布节点） */
export type GridSplitCell = {
  url: string;
  row: number;
  col: number;
  index: number;
  label?: string;
};

export function parseGridSplitCells(raw: unknown): GridSplitCell[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c, i) => ({
        url: String((c as any)?.url || '').trim(),
        row: Number((c as any)?.row) || 0,
        col: Number((c as any)?.col) || 0,
        index: Number((c as any)?.index) || i,
        label: String((c as any)?.label || ''),
      }))
      .filter((c) => !!c.url);
  } catch {
    return [];
  }
}

function loadImageElement(url: string, useCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

/** 优先 fetch→blob（同源或允许 CORS），再回退 Image */
async function loadImage(url: string): Promise<HTMLImageElement> {
  const src = String(url || '').trim();
  if (!src) throw new Error('图片地址为空');

  // data/blob：直接解码
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return loadImageElement(src, false);
  }

  // 尝试按二进制拉取，绕过部分「能显示但不能 canvas」的情况
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size < 32) throw new Error('空文件');
    const obj = URL.createObjectURL(blob);
    try {
      return await loadImageElement(obj, false);
    } finally {
      // 解码完成后即可释放；像素已在 img 里
      setTimeout(() => URL.revokeObjectURL(obj), 0);
    }
  } catch {
    /* 再试 Image + CORS */
  }

  try {
    return await loadImageElement(src, true);
  } catch {
    const remote = /^https?:\/\//i.test(src);
    throw new Error(
      remote
        ? '图片加载失败：在线地址跨域，无法裁切。请重试（将自动转存到本地）或先下载到素材库'
        : '图片加载失败',
    );
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png');
  });
}

/** 单格独立 canvas 导出，避免共用画布 + toBlob 异步导致某格损坏 */
async function exportCellBlob(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  cellW: number,
  cellH: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  try {
    ctx.drawImage(img, sx, sy, cellW, cellH, 0, 0, cellW, cellH);
  } catch {
    throw new Error('图片跨域受限，无法裁切（请使用本地/已转存地址）');
  }

  let blob = await canvasToPngBlob(canvas);
  // 空/过小视为损坏，再导出一次
  if (!blob || blob.size < 32) {
    blob = await canvasToPngBlob(canvas);
  }
  if (!blob || blob.size < 32) {
    throw new Error('切分块导出失败');
  }
  return blob;
}

export async function splitImageToGrid(
  url: string,
  rows: number,
  cols: number,
): Promise<GridCellBlob[]> {
  const r = Math.max(1, Math.floor(rows) || 1);
  const c = Math.max(1, Math.floor(cols) || 1);
  const img = await loadImage(url);
  const cellW = Math.floor(img.naturalWidth / c);
  const cellH = Math.floor(img.naturalHeight / r);
  if (cellW < 1 || cellH < 1) throw new Error('图片尺寸过小，无法切分');

  const out: GridCellBlob[] = [];
  const stamp = Date.now().toString(36);

  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const index = row * c + col;
      const blob = await exportCellBlob(img, col * cellW, row * cellH, cellW, cellH);
      out.push({
        row,
        col,
        index,
        blob,
        // 带时间戳，避免浏览器/中间层按同名缓存到坏图
        filename: `grid_${r}x${c}_${index + 1}_${stamp}.png`,
        pixelW: cellW,
        pixelH: cellH,
      });
    }
  }
  return out;
}

/** 切分格在画布上的缩略尺寸（明显小于源图卡，接近 updream） */
export function gridSplitDisplaySize(
  pixelW: number,
  pixelH: number,
  cols: number,
): { cardW: number; cardH: number; gap: number } {
  const pw = Math.max(1, pixelW || 1);
  const ph = Math.max(1, pixelH || 1);
  // 列越多缩略越小；单格图面宽约 52~68
  const frameW = cols >= 5 ? 52 : cols >= 4 ? 56 : cols >= 3 ? 60 : 68;
  const capH = 16;
  const frameH = Math.round((frameW * ph) / pw);
  const cardW = frameW;
  const cardH = Math.max(frameH + capH, 56);
  const gap = cols >= 4 ? 6 : 7;
  return { cardW, cardH, gap };
}
