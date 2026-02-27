export type CanvasInfo = {
  id: string;
  label: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  imageService?: string;
  imageUrl?: string;
  existingAnnotations: AnnotationData[];
};

export type AnnotationData = {
  id: string;
  canvasId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  language: string;
  createdAt: number;
  /** Optional non-IIIF values (e.g. OCR confidence). Stored separately from the exported manifest. */
  extras?: Record<string, unknown>;
};

export type ManifestState = {
  id?: string;
  label: string;
  canvases: CanvasInfo[];
};

export type ProjectMeta = {
  id: string;
  name: string;
  sourceType: 'manifest-url' | 'manifest-file' | 'file-upload';
  sourceRef: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredData = {
  defaultLanguage: string;
  annotationsByCanvas: Record<string, AnnotationData[]>;
  currentCanvasIndex: number;
};
