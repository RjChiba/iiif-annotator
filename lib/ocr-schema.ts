import type { AnnotationData } from './types';

export type BboxConfig =
  | { type: 'quad'; path: string }
  | { type: 'xywh-array'; path: string }
  | { type: 'xywh'; x: string; y: string; w: string; h: string }
  | { type: 'ltrb'; left: string; top: string; right: string; bottom: string };

/**
 * Canvas–JSON file matching strategy.
 *
 * filename-label          : canvas.label === JSON filename (extension removed)
 * filename-numeric-suffix : trailing `_NNNNN` in filename maps to canvas index
 *                           (zeroBased=true → `_00000` = canvas 0,
 *                            zeroBased=false → `_00001` = canvas 0)
 * json-path               : a field inside the JSON is matched against canvas labels
 */
export type CanvasMatchConfig =
  | { type: 'filename-label' }
  | { type: 'filename-numeric-suffix'; zeroBased: boolean }
  | { type: 'json-path'; path: string };

export type OcrSchema = {
  id: string;
  name: string;
  itemsPath: string;
  itemsFlat: boolean;
  textPath: string;
  bbox: BboxConfig;
  imageWidthPath?: string;
  imageHeightPath?: string;
  confidencePath?: string;
  /**
   * How to match a JSON file to a canvas.
   * When omitted, falls back to: filename-label → filename-numeric-suffix (zeroBased).
   */
  canvasMatch?: CanvasMatchConfig;
  /**
   * Optional JSON Schema (draft 2020-12) describing the expected input structure.
   * Stored for documentation and future validation; not enforced at runtime yet.
   */
  jsonSchema?: Record<string, unknown>;
};

export const NDL_OCR_SCHEMA: OcrSchema = {
  id: '__ndl-ocr__',
  name: 'NDL OCR',
  itemsPath: 'contents',
  itemsFlat: true,
  textPath: 'text',
  bbox: { type: 'quad', path: 'boundingBox' },
  imageWidthPath: 'imginfo.img_width',
  imageHeightPath: 'imginfo.img_height',
  confidencePath: 'confidence',
  canvasMatch: { type: 'filename-numeric-suffix', zeroBased: true },
  jsonSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['contents', 'imginfo'],
    properties: {
      contents: {
        type: 'array',
        description: 'ページを跨いだ行の配列（各要素も配列）',
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['boundingBox', 'text'],
            properties: {
              boundingBox: {
                type: 'array',
                description: '4頂点 [[x,y], [x,y], [x,y], [x,y]]',
                items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                minItems: 4,
                maxItems: 4,
              },
              text: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
      imginfo: {
        type: 'object',
        required: ['img_width', 'img_height'],
        properties: {
          img_width: { type: 'number' },
          img_height: { type: 'number' },
          img_name: { type: 'string' },
          img_path: { type: 'string' },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

export function getByPath(obj: unknown, dotPath: string): unknown {
  if (!dotPath) return obj;
  return dotPath.split('.').reduce((cur: unknown, key) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

// ---------------------------------------------------------------------------
// Canvas matching
// ---------------------------------------------------------------------------

/**
 * Determine which canvas index a JSON file belongs to.
 *
 * When `matchConfig` is undefined, the following order is tried:
 *   1. filename-label  (exact)
 *   2. filename-numeric-suffix, zeroBased=true  (_00000 → 0)
 *   3. filename-numeric-suffix, zeroBased=false (_00001 → 0)
 *
 * @param baseName     JSON filename without extension
 * @param json         Parsed JSON content (used only for json-path strategy)
 * @param canvasLabels Array of canvas labels in order
 * @param matchConfig  Explicit strategy; omit for auto-detection
 * @returns Canvas index (0-based), or -1 if not found
 */
export function matchCanvasIndex(
  baseName: string,
  json: unknown,
  canvasLabels: string[],
  matchConfig?: CanvasMatchConfig,
): number {
  if (!matchConfig) {
    // 1. filename-label
    const labelIdx = canvasLabels.indexOf(baseName);
    if (labelIdx !== -1) return labelIdx;

    // 2. numeric suffix, 0-based
    const idx0 = numericSuffixMatch(baseName, canvasLabels, true);
    if (idx0 !== -1) return idx0;

    // 3. numeric suffix, 1-based (backward compat)
    return numericSuffixMatch(baseName, canvasLabels, false);
  }

  if (matchConfig.type === 'filename-label') {
    return canvasLabels.indexOf(baseName);
  }

  if (matchConfig.type === 'filename-numeric-suffix') {
    return numericSuffixMatch(baseName, canvasLabels, matchConfig.zeroBased);
  }

  if (matchConfig.type === 'json-path') {
    const val = getByPath(json, matchConfig.path);
    if (typeof val === 'string') {
      const exact = canvasLabels.indexOf(val);
      if (exact !== -1) return exact;
      // Try without file extension
      const noExt = val.replace(/\.[^.]+$/, '');
      return canvasLabels.indexOf(noExt);
    }
    return -1;
  }

  return -1;
}

function numericSuffixMatch(baseName: string, canvasLabels: string[], zeroBased: boolean): number {
  const match = baseName.match(/_(\d+)$/);
  if (!match) return -1;
  const num = parseInt(match[1], 10);
  if (zeroBased) {
    return num >= 0 && num < canvasLabels.length ? num : -1;
  } else {
    return num >= 1 && num <= canvasLabels.length ? num - 1 : -1;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const toPositiveNumber = (value: unknown): number | undefined => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type TargetSize = { width?: number; height?: number };

export function parseWithSchema(
  json: unknown,
  schema: OcrSchema,
  canvasId: string,
  language = 'ja',
  targetSize?: TargetSize
): AnnotationData[] {
  const rawItems = getByPath(json, schema.itemsPath);
  if (!Array.isArray(rawItems)) return [];
  const items: unknown[] = schema.itemsFlat ? (rawItems as unknown[]).flat() : rawItems;

  const sourceWidth = toPositiveNumber(schema.imageWidthPath ? getByPath(json, schema.imageWidthPath) : undefined);
  const sourceHeight = toPositiveNumber(schema.imageHeightPath ? getByPath(json, schema.imageHeightPath) : undefined);
  const targetWidth = toPositiveNumber(targetSize?.width);
  const targetHeight = toPositiveNumber(targetSize?.height);
  const scaleX = sourceWidth && targetWidth ? targetWidth / sourceWidth : 1;
  const scaleY = sourceHeight && targetHeight ? targetHeight / sourceHeight : 1;

  const now = Date.now();

  return items
    .filter((item) => {
      const text = getByPath(item, schema.textPath);
      return typeof text === 'string' && text.trim() !== '';
    })
    .map((item, idx) => {
      const text = String(getByPath(item, schema.textPath) ?? '');

      let left = 0, top = 0, right = 0, bottom = 0;
      const { bbox } = schema;

      if (bbox.type === 'quad') {
        const quad = getByPath(item, bbox.path);
        if (Array.isArray(quad)) {
          const xs = (quad as [number, number][]).map((p) => p[0]);
          const ys = (quad as [number, number][]).map((p) => p[1]);
          left = Math.min(...xs) * scaleX;
          top = Math.min(...ys) * scaleY;
          right = Math.max(...xs) * scaleX;
          bottom = Math.max(...ys) * scaleY;
        }
      } else if (bbox.type === 'xywh-array') {
        const arr = getByPath(item, bbox.path);
        if (Array.isArray(arr)) {
          const [x, y, w, h] = arr as number[];
          left = x * scaleX;
          top = y * scaleY;
          right = (x + w) * scaleX;
          bottom = (y + h) * scaleY;
        }
      } else if (bbox.type === 'xywh') {
        const x = Number(getByPath(item, bbox.x) ?? 0);
        const y = Number(getByPath(item, bbox.y) ?? 0);
        const w = Number(getByPath(item, bbox.w) ?? 0);
        const h = Number(getByPath(item, bbox.h) ?? 0);
        left = x * scaleX;
        top = y * scaleY;
        right = (x + w) * scaleX;
        bottom = (y + h) * scaleY;
      } else if (bbox.type === 'ltrb') {
        left = Number(getByPath(item, bbox.left) ?? 0) * scaleX;
        top = Number(getByPath(item, bbox.top) ?? 0) * scaleY;
        right = Number(getByPath(item, bbox.right) ?? 0) * scaleX;
        bottom = Number(getByPath(item, bbox.bottom) ?? 0) * scaleY;
      }

      if (targetWidth) {
        left = clamp(left, 0, targetWidth);
        right = clamp(right, 0, targetWidth);
      }
      if (targetHeight) {
        top = clamp(top, 0, targetHeight);
        bottom = clamp(bottom, 0, targetHeight);
      }

      const extras: Record<string, unknown> = {};
      if (schema.confidencePath) {
        const conf = getByPath(item, schema.confidencePath);
        if (typeof conf === 'number') extras.confidence = conf;
      }

      return {
        id: `ocr-${now}-${idx}`,
        canvasId,
        x: left,
        y: top,
        w: Math.max(0, right - left),
        h: Math.max(0, bottom - top),
        text,
        language,
        createdAt: now + idx,
        ...(Object.keys(extras).length > 0 ? { extras } : {}),
      } as AnnotationData;
    });
}
