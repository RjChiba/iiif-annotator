import { v4 as uuidv4 } from 'uuid';
import { AnnotationData } from './types';

export const buildManifestWithAnnotations = (
  rawManifest: unknown,
  annotationsByCanvas: Record<string, AnnotationData[]>
): unknown => {
  const manifest = JSON.parse(JSON.stringify(rawManifest)) as Record<string, unknown> & { items?: unknown[] };

  if (!Array.isArray(manifest.items)) return manifest;

  manifest.items = manifest.items.map((canvas: unknown) => {
    const c = canvas as Record<string, unknown>;
    if (typeof c.id !== 'string') return c;

    const annotations = annotationsByCanvas[c.id] ?? [];
    const { annotations: _existing, ...rest } = c;

    if (annotations.length === 0) return rest;

    return {
      ...rest,
      annotations: [
        {
          id: `urn:uuid:${uuidv4()}`,
          type: 'AnnotationPage',
          items: annotations.map((a) => ({
            id: `urn:uuid:${uuidv4()}`,
            type: 'Annotation',
            motivation: 'supplementing',
            body: {
              type: 'TextualBody',
              value: a.text,
              format: 'text/plain',
              ...(a.language ? { language: a.language } : {})
            },
            target: toTarget(a)
          }))
        }
      ]
    };
  });

  return manifest;
};

const context = 'http://iiif.io/api/presentation/3/context.json';

const toTarget = (annotation: AnnotationData) =>
  `${annotation.canvasId}#xywh=${Math.round(annotation.x)},${Math.round(annotation.y)},${Math.round(annotation.w)},${Math.round(annotation.h)}`;

export const buildAnnotationPage = (annotations: AnnotationData[]) => ({
  '@context': context,
  id: `urn:uuid:${uuidv4()}`,
  type: 'AnnotationPage',
  items: annotations.map((a) => ({
    id: `urn:uuid:${uuidv4()}`,
    type: 'Annotation',
    motivation: 'supplementing',
    body: {
      type: 'TextualBody',
      value: a.text,
      format: 'text/plain',
      ...(a.language ? { language: a.language } : {})
    },
    target: toTarget(a)
  }))
});

export const downloadJson = (filename: string, obj: unknown) => {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/ld+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
