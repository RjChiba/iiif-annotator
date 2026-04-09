import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type SourceType = 'manifest-url' | 'manifest-file' | 'file-upload';

export type ProjectMeta = {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceRef: string;
  createdAt: string;
  updatedAt: string;
};

const iiifDataDir = process.env.IIIF_DATA_DIR;
const dataRoot = iiifDataDir
  ? path.join(iiifDataDir, 'projects')
  : path.join(process.cwd(), 'data', 'projects');
const publicUploadsRoot = iiifDataDir
  ? path.join(iiifDataDir, 'uploads')
  : path.join(process.cwd(), 'public', 'uploads');

const projectDir = (projectId: string) => path.join(dataRoot, projectId);
const metaPath = (projectId: string) => path.join(projectDir(projectId), 'meta.json');
const manifestPath = (projectId: string) => path.join(projectDir(projectId), 'manifest.json');
const annotationsDir = (projectId: string) => path.join(projectDir(projectId), 'annotations');

export const ensureRoots = async () => {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(publicUploadsRoot, { recursive: true });
};

export const listProjects = async (): Promise<ProjectMeta[]> => {
  await ensureRoots();
  const dirs = await fs.readdir(dataRoot, { withFileTypes: true });
  const metas = await Promise.all(
    dirs
      .filter((d) => d.isDirectory())
      .map(async (d) => {
        try {
          const meta = JSON.parse(await fs.readFile(metaPath(d.name), 'utf-8')) as ProjectMeta;
          return meta;
        } catch {
          return null;
        }
      })
  );

  return metas.filter((m): m is ProjectMeta => Boolean(m)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const createProject = async (payload: {
  name: string;
  sourceType: SourceType;
  sourceRef: string;
  manifest: unknown;
}) => {
  await ensureRoots();
  const id = randomUUID();
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id: `urn:uuid:${id}`,
    name: payload.name,
    sourceType: payload.sourceType,
    sourceRef: payload.sourceRef,
    createdAt: now,
    updatedAt: now
  };

  const dir = projectDir(id);
  await fs.mkdir(annotationsDir(id), { recursive: true });
  await fs.writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  await fs.writeFile(manifestPath(id), JSON.stringify(payload.manifest, null, 2));

  return { projectId: id, meta };
};


export const updateProjectManifest = async (projectId: string, manifest: unknown, name?: string) => {
  await fs.writeFile(manifestPath(projectId), JSON.stringify(manifest, null, 2));
  const rawMeta = await fs.readFile(metaPath(projectId), 'utf-8');
  const meta = JSON.parse(rawMeta) as ProjectMeta;
  if (name) meta.name = name;
  meta.updatedAt = new Date().toISOString();
  await fs.writeFile(metaPath(projectId), JSON.stringify(meta, null, 2));
};
export const readProject = async (projectId: string) => {
  const [meta, manifest] = await Promise.all([
    fs.readFile(metaPath(projectId), 'utf-8').then((v) => JSON.parse(v) as ProjectMeta),
    fs.readFile(manifestPath(projectId), 'utf-8').then((v) => JSON.parse(v) as unknown)
  ]);

  const dir = annotationsDir(projectId);
  let annotationFiles: string[] = [];
  try {
    annotationFiles = await fs.readdir(dir);
  } catch {
    annotationFiles = [];
  }

  const annotationsByCanvasIndex: Record<string, unknown> = {};
  await Promise.all(
    annotationFiles.filter((f) => f.endsWith('.json')).map(async (f) => {
      annotationsByCanvasIndex[f.replace('.json', '')] = JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'));
    })
  );

  return { meta, manifest, annotationsByCanvasIndex };
};

export const writeCanvasAnnotations = async (projectId: string, canvasIndex: number, annotationPage: unknown) => {
  await fs.mkdir(annotationsDir(projectId), { recursive: true });
  await fs.writeFile(path.join(annotationsDir(projectId), `${canvasIndex}.json`), JSON.stringify(annotationPage, null, 2));
  const rawMeta = await fs.readFile(metaPath(projectId), 'utf-8');
  const meta = JSON.parse(rawMeta) as ProjectMeta;
  meta.updatedAt = new Date().toISOString();
  await fs.writeFile(metaPath(projectId), JSON.stringify(meta, null, 2));
};

export const deleteProject = async (projectId: string) => {
  await fs.rm(projectDir(projectId), { recursive: true, force: true });
  await fs.rm(path.join(publicUploadsRoot, projectId), { recursive: true, force: true });
};

export const uploadDir = (projectId: string) => path.join(publicUploadsRoot, projectId);

// ─── Per-annotation CRUD ──────────────────────────────────────────────────────

export type AnnotationItem = {
  id: string;
  type: 'Annotation';
  motivation: 'supplementing';
  body: { type: 'TextualBody'; value: string; format: string; language?: string };
  target: string;
  _extras?: Record<string, unknown>;
};

const readAnnotationPage = async (
  projectId: string,
  canvasIndex: number
): Promise<{ id: string; items: AnnotationItem[] } | null> => {
  const p = path.join(annotationsDir(projectId), `${canvasIndex}.json`);
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as { id: string; items: AnnotationItem[] };
  } catch {
    return null;
  }
};

export const listAnnotationItems = async (
  projectId: string,
  canvasIndex: number
): Promise<AnnotationItem[]> => {
  const page = await readAnnotationPage(projectId, canvasIndex);
  return page?.items ?? [];
};

export const createAnnotationItem = async (
  projectId: string,
  canvasIndex: number,
  data: Omit<AnnotationItem, 'id'>
): Promise<AnnotationItem> => {
  const page = await readAnnotationPage(projectId, canvasIndex);
  const item: AnnotationItem = { id: `urn:uuid:${randomUUID()}`, ...data };
  const items = page ? [...page.items, item] : [item];
  const pageId = page?.id ?? `urn:uuid:${randomUUID()}`;
  await writeCanvasAnnotations(projectId, canvasIndex, {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: pageId,
    type: 'AnnotationPage',
    items
  });
  return item;
};

export const updateAnnotationItem = async (
  projectId: string,
  canvasIndex: number,
  annotationId: string,
  patch: Partial<Omit<AnnotationItem, 'id'>>
): Promise<AnnotationItem | null> => {
  const page = await readAnnotationPage(projectId, canvasIndex);
  if (!page) return null;
  const idx = page.items.findIndex((i) => i.id === annotationId);
  if (idx === -1) return null;
  const updated: AnnotationItem = { ...page.items[idx], ...patch, id: annotationId };
  const items = [...page.items];
  items[idx] = updated;
  await writeCanvasAnnotations(projectId, canvasIndex, { ...page, items });
  return updated;
};

export const deleteAnnotationItem = async (
  projectId: string,
  canvasIndex: number,
  annotationId: string
): Promise<boolean> => {
  const page = await readAnnotationPage(projectId, canvasIndex);
  if (!page) return false;
  const filtered = page.items.filter((i) => i.id !== annotationId);
  if (filtered.length === page.items.length) return false;
  await writeCanvasAnnotations(projectId, canvasIndex, { ...page, items: filtered });
  return true;
};
