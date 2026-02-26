import type { AnnotationData } from './types';

interface NdlOcrItem {
  boundingBox: [[number, number], [number, number], [number, number], [number, number]];
  id: number;
  isVertical: string;
  text: string;
  isTextline: string;
  confidence: number;
}

export interface NdlOcrJson {
  contents: NdlOcrItem[][];
  imginfo: {
    img_width: number;
    img_height: number;
    img_path: string;
    img_name: string;
  };
}

export type NdlOcrTargetSize = {
  width?: number;
  height?: number;
};

const toPositiveNumber = (value: unknown): number | undefined => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function parseNdlOcr(
  json: NdlOcrJson,
  canvasId: string,
  language = 'ja',
  targetSize?: NdlOcrTargetSize
): AnnotationData[] {
  const items = json.contents.flat();
  const now = Date.now();
  const sourceWidth = toPositiveNumber(json.imginfo?.img_width);
  const sourceHeight = toPositiveNumber(json.imginfo?.img_height);
  const targetWidth = toPositiveNumber(targetSize?.width);
  const targetHeight = toPositiveNumber(targetSize?.height);
  const scaleX = sourceWidth && targetWidth ? targetWidth / sourceWidth : 1;
  const scaleY = sourceHeight && targetHeight ? targetHeight / sourceHeight : 1;

  return items
    .filter((item) => item.text.trim() !== '')
    .map((item, idx) => {
      const xs = item.boundingBox.map((p) => p[0]);
      const ys = item.boundingBox.map((p) => p[1]);
      let left = Math.min(...xs) * scaleX;
      let top = Math.min(...ys) * scaleY;
      let right = Math.max(...xs) * scaleX;
      let bottom = Math.max(...ys) * scaleY;

      if (targetWidth) {
        left = clamp(left, 0, targetWidth);
        right = clamp(right, 0, targetWidth);
      }
      if (targetHeight) {
        top = clamp(top, 0, targetHeight);
        bottom = clamp(bottom, 0, targetHeight);
      }

      return {
        id: `ndl-ocr-${now}-${idx}`,
        canvasId,
        x: left,
        y: top,
        w: Math.max(0, right - left),
        h: Math.max(0, bottom - top),
        text: item.text,
        language,
        createdAt: now + idx,
      } as AnnotationData;
    });
}
