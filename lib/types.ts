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
};

export type ManifestState = {
  id?: string;
  label: string;
  sourceKey: string;
  canvases: CanvasInfo[];
};

export type StoredData = {
  defaultLanguage: string;
  annotationsByCanvas: Record<string, AnnotationData[]>;
  currentCanvasIndex: number;
};
