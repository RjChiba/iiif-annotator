import { AnnotationData, CanvasInfo, ManifestState } from './types';

const getString = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  return undefined;
};

const parseLabel = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const first = Object.values(value as Record<string, unknown[]>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  }
  return '';
};

const parseTarget = (target: string): { canvasId: string; x: number; y: number; w: number; h: number } | null => {
  const [canvasId, fragment] = target.split('#xywh=');
  if (!canvasId || !fragment) return null;
  const [x, y, w, h] = fragment.split(',').map(Number);
  if ([x, y, w, h].some(Number.isNaN)) return null;
  return { canvasId, x, y, w, h };
};

const parseExistingSupplementingAnnotations = (canvas: any): AnnotationData[] => {
  const pages = Array.isArray(canvas.annotations) ? canvas.annotations : [];
  const result: AnnotationData[] = [];

  pages.forEach((page: any) => {
    const items = Array.isArray(page.items) ? page.items : [];
    items.forEach((item: any, index: number) => {
      if (item?.type !== 'Annotation' || item?.motivation !== 'supplementing') return;
      const body = item.body;
      const value = typeof body?.value === 'string' ? body.value : '';
      const language = typeof body?.language === 'string' ? body.language : '';
      const target = typeof item?.target === 'string' ? parseTarget(item.target) : null;
      if (!target) return;
      result.push({
        id: getString(item.id) ?? `${canvas.id}-legacy-${index}`,
        canvasId: target.canvasId,
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h,
        text: value,
        language,
        createdAt: Date.now() + index
      });
    });
  });

  return result;
};

const getCanvasImage = (canvas: any): { imageService?: string; imageUrl?: string } => {
  const items = Array.isArray(canvas?.items) ? canvas.items : [];
  const painting = items[0]?.items?.[0]?.body;
  if (!painting) return {};

  const service = Array.isArray(painting.service) ? painting.service[0] : painting.service;
  const serviceId = getString(service?.id);
  const imageUrl = getString(painting.id);
  return { imageService: serviceId, imageUrl };
};

export const parseManifest = (manifest: any): ManifestState => {
  if (manifest?.type !== 'Manifest') {
    throw new Error('IIIF Presentation API v3 の Manifest ではありません。');
  }

  const canvasesRaw = Array.isArray(manifest.items) ? manifest.items : [];
  if (!canvasesRaw.length) {
    throw new Error('Manifest に Canvas が見つかりません。');
  }

  const canvases: CanvasInfo[] = canvasesRaw.map((canvas: any, index: number) => {
    if (canvas.type !== 'Canvas' || typeof canvas.id !== 'string') {
      throw new Error(`Canvas #${index + 1} の形式が不正です。`);
    }
    const image = getCanvasImage(canvas);
    const thumbnail = getString(Array.isArray(canvas.thumbnail) ? canvas.thumbnail[0]?.id : canvas.thumbnail?.id);
    return {
      id: canvas.id,
      label: parseLabel(canvas.label) || `Canvas ${index + 1}`,
      width: Number(canvas.width) || undefined,
      height: Number(canvas.height) || undefined,
      thumbnail,
      ...image,
      existingAnnotations: parseExistingSupplementingAnnotations(canvas)
    };
  });

  return {
    id: getString(manifest.id),
    label: parseLabel(manifest.label) || 'Untitled Manifest',
    canvases
  };
};
