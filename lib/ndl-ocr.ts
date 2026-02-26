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

export function parseNdlOcr(json: NdlOcrJson, canvasId: string, language = 'ja'): AnnotationData[] {
  const items = json.contents.flat();
  const now = Date.now();
  return items
    .filter((item) => item.text.trim() !== '')
    .map((item, idx) => {
      const xs = item.boundingBox.map((p) => p[0]);
      const ys = item.boundingBox.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      return {
        id: `ndl-ocr-${now}-${idx}`,
        canvasId,
        x,
        y,
        w,
        h,
        text: item.text,
        language,
        createdAt: now + idx,
      } as AnnotationData;
    });
}
