'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { parseManifest } from '@/lib/iiif';
import { AnnotationData, ManifestState, ProjectMeta } from '@/lib/types';
import ImageAnnotator from '@/components/ImageAnnotator';
import { buildAnnotationPage, buildManifestWithAnnotations, downloadJson } from '@/lib/export';

const preview = (text: string) => (text.length > 24 ? `${text.slice(0, 24)}...` : text || '（未入力）');

type LoadedProject = {
  id: string;
  meta: ProjectMeta;
  manifest: ManifestState;
  rawManifest: unknown;
};

const loadImageDimensions = async (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });

export default function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manifestUrl, setManifestUrl] = useState('');
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [annotationsByCanvas, setAnnotationsByCanvas] = useState<Record<string, AnnotationData[]>>({});
  const [currentCanvasIndex, setCurrentCanvasIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [drawMode, setDrawMode] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState('ja');
  const [projectBusy, setProjectBusy] = useState(false);

  const currentCanvas = project?.manifest.canvases[currentCanvasIndex];
  const currentAnnotations = useMemo(() => {
    if (!currentCanvas) return [];
    return [...(annotationsByCanvas[currentCanvas.id] || [])].sort((a, b) => a.y - b.y);
  }, [annotationsByCanvas, currentCanvas]);
  const selected = currentAnnotations.find((a) => a.id === selectedId);

  const refreshProjects = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects || []);
  };

  useEffect(() => {
    void refreshProjects();
  }, []);

  const loadProject = async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('プロジェクトの取得に失敗しました。');
      const data = await res.json();
      const parsed = parseManifest(data.manifest);
      const byCanvas: Record<string, AnnotationData[]> = Object.fromEntries(
        parsed.canvases.map((canvas, index) => {
          const savedItems = data.annotationsByCanvasIndex?.[String(index)]?.items;
          if (Array.isArray(savedItems)) {
            const loaded = savedItems.map((item: any, idx: number) => {
              const target = typeof item?.target === 'string' ? item.target.split('#xywh=')[1] : null;
              const [x, y, w, h] = (target || '0,0,0,0').split(',').map(Number);
              return {
                id: item.id || `${canvas.id}-${idx}`,
                canvasId: canvas.id,
                x,
                y,
                w,
                h,
                text: item?.body?.value || '',
                language: item?.body?.language || '',
                createdAt: Date.now() + idx
              } as AnnotationData;
            });
            return [canvas.id, loaded];
          }
          return [canvas.id, [...canvas.existingAnnotations]];
        })
      );

      setProject({ id: projectId, meta: data.meta, manifest: parsed, rawManifest: data.manifest });
      setAnnotationsByCanvas(byCanvas);
      setCurrentCanvasIndex(0);
      setSelectedId(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プロジェクト読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const createProjectFromManifest = async (manifest: unknown, sourceType: ProjectMeta['sourceType'], sourceRef: string) => {
    const parsed = parseManifest(manifest);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: parsed.label, sourceType, sourceRef, manifest })
    });
    const data = await res.json();
    await refreshProjects();
    await loadProject(data.projectId);
  };

  const onLoadUrl = async () => {
    if (!manifestUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(manifestUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await createProjectFromManifest(json, 'manifest-url', manifestUrl.trim());
      setManifestUrl('');
    } catch {
      setError('Manifest の読み込みに失敗しました。CORS 設定または URL を確認してください。');
    } finally {
      setLoading(false);
    }
  };

  const onUploadManifestFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await createProjectFromManifest(JSON.parse(text), 'manifest-file', file.name);
    } catch {
      setError('JSON の解析に失敗しました。manifest.json を確認してください。');
    }
  };

  const onUploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const files = [...event.target.files];
    if (files.some((f) => f.type === 'application/pdf')) {
      setError('現時点では PDF の自動変換は未対応です。画像ファイルのみアップロードしてください。');
      return;
    }

    setProjectBusy(true);
    setError(null);

    try {
      const projectCreate = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: files[0]?.name || 'Uploaded Files',
          sourceType: 'file-upload',
          sourceRef: files.map((f) => f.name).join(', '),
          manifest: { type: 'Manifest', id: 'urn:uuid:pending', label: { ja: ['Uploaded Files'] }, items: [] }
        })
      });
      const { projectId } = await projectCreate.json();

      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
      const uploads: { url: string; filename: string; width: number; height: number }[] = [];
      for (const file of sorted) {
        const form = new FormData();
        form.append('projectId', projectId);
        form.append('file', file);
        const upload = await fetch('/api/upload', { method: 'POST', body: form });
        const uploaded = await upload.json();
        const dims = await loadImageDimensions(uploaded.url);
        uploads.push({ ...uploaded, ...dims });
      }

      const manifest = {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: `urn:uuid:${projectId}`,
        type: 'Manifest',
        label: { ja: [`${files[0].name} から生成`] },
        items: uploads.map((u, index) => ({
          id: `urn:uuid:${projectId}:canvas:${index + 1}`,
          type: 'Canvas',
          width: u.width,
          height: u.height,
          label: { none: [u.filename.replace(/\.[^.]+$/, '')] },
          items: [
            {
              id: `urn:uuid:${projectId}:page:${index + 1}`,
              type: 'AnnotationPage',
              items: [
                {
                  id: `urn:uuid:${projectId}:painting:${index + 1}`,
                  type: 'Annotation',
                  motivation: 'painting',
                  body: { id: u.url, type: 'Image', format: 'image/png', width: u.width, height: u.height },
                  target: `urn:uuid:${projectId}:canvas:${index + 1}`
                }
              ]
            }
          ]
        }))
      };

      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, name: files[0]?.name || 'Uploaded Files' })
      });
      await refreshProjects();
      await loadProject(projectId);
    } catch {
      setError('ファイルアップロードに失敗しました。');
    } finally {
      setProjectBusy(false);
    }
  };

  const saveCanvasAnnotations = async (canvasIndex: number, canvasId: string, items: AnnotationData[]) => {
    if (!project) return;
    await fetch(`/api/projects/${project.id}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvasIndex, annotationPage: buildAnnotationPage(items.map((a) => ({ ...a, canvasId }))) })
    });
    void refreshProjects();
  };

  const upsertAnnotation = (canvasId: string, updater: (current: AnnotationData[]) => AnnotationData[]) => {
    setAnnotationsByCanvas((prev) => ({ ...prev, [canvasId]: updater(prev[canvasId] || []) }));
  };

  const onCreateAnnotation = (annotation: Omit<AnnotationData, 'id' | 'createdAt'>) => {
    const id = `${Date.now()}`;
    const next: AnnotationData = { ...annotation, id, createdAt: Date.now(), language: defaultLanguage };
    upsertAnnotation(annotation.canvasId, (current) => [...current, next]);
    setSelectedId(id);
    setDrawMode(false);
  };

  const onUpdateAnnotation = (id: string, updates: Partial<AnnotationData>) => {
    if (!currentCanvas) return;
    upsertAnnotation(currentCanvas.id, (current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const onDeleteSelected = () => {
    if (!selected || !currentCanvas) return;
    if (!window.confirm('このアノテーションを削除しますか？')) return;
    upsertAnnotation(currentCanvas.id, (current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(undefined);
  };

  useEffect(() => {
    if (!project || !currentCanvas) return;
    void saveCanvasAnnotations(currentCanvasIndex, currentCanvas.id, currentAnnotations);
  }, [project, currentCanvasIndex, currentCanvas, currentAnnotations]);

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if (!project) return;
      if (event.key === 'ArrowRight') setCurrentCanvasIndex((prev) => Math.min(prev + 1, project.manifest.canvases.length - 1));
      if (event.key === 'ArrowLeft') setCurrentCanvasIndex((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [project]);

  const exportAll = () => {
    if (!project) return;
    const result = buildManifestWithAnnotations(project.rawManifest, annotationsByCanvas);
    downloadJson('manifest-annotated.json', result);
  };

  const onDeleteProject = async (id: string) => {
    if (!window.confirm('このプロジェクトを削除しますか？')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (project?.id === id) setProject(null);
    await refreshProjects();
  };

  if (!project) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-5xl rounded border bg-white p-4">
          <h1 className="text-lg font-semibold">プロジェクト一覧</h1>
          <p className="text-sm text-slate-600">既存プロジェクトを開くか、新規プロジェクトを作成してください。</p>

          <div className="mt-3 rounded border p-3">
            <h2 className="mb-2 font-medium">新規プロジェクト作成</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-80 flex-1 rounded border px-3 py-2" value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)} placeholder="https://example.org/manifest.json" />
              <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={onLoadUrl} disabled={loading}>{loading ? '読み込み中...' : 'Manifest URL読込'}</button>
              <label className="cursor-pointer rounded border px-4 py-2">
                Manifest ファイル
                <input type="file" accept="application/json,.json" className="hidden" onChange={onUploadManifestFile} />
              </label>
              <label className="cursor-pointer rounded border px-4 py-2">
                画像 / PDF アップロード
                <input type="file" accept="image/jpeg,image/png,application/pdf" multiple className="hidden" onChange={onUploadFiles} />
              </label>
            </div>
            {projectBusy && <p className="mt-2 text-sm">アップロード処理中...</p>}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div className="mt-4">
            {projects.map((p) => (
              <div key={p.id} className="mb-2 flex items-center justify-between rounded border p-3">
                <button className="text-left" onClick={() => void loadProject(p.id.replace('urn:uuid:', ''))}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-600">作成: {new Date(p.createdAt).toLocaleString()} / 更新: {new Date(p.updatedAt).toLocaleString()}</div>
                </button>
                <button className="rounded bg-red-600 px-3 py-1 text-white" onClick={() => void onDeleteProject(p.id.replace('urn:uuid:', ''))}>削除</button>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mb-4 rounded border bg-white p-3">
        <h1 className="text-lg font-semibold">{project.meta.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="rounded border px-3 py-2" onClick={() => setProject(null)}>← プロジェクト一覧</button>
          <button className="rounded border px-3 py-2" onClick={() => setDrawMode((v) => !v)}>{drawMode ? '閲覧モード' : '描画モード'}</button>
          <button className="rounded border px-3 py-2" onClick={exportAll}>Manifestを書き出し</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid h-[calc(100vh-170px)] grid-cols-[18rem_1fr_22rem] gap-3">
        <aside className="overflow-y-auto rounded border bg-white p-2">
          <h2 className="mb-2 font-medium">Canvas 一覧</h2>
          {project.manifest.canvases.map((canvas, index) => (
            <button
              key={canvas.id}
              className={`mb-2 block w-full rounded border p-2 text-left text-sm ${index === currentCanvasIndex ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
              onClick={() => { setCurrentCanvasIndex(index); setSelectedId(undefined); }}
            >
              <div className="mb-1 font-medium">{index + 1}. {canvas.label}</div>
              {canvas.thumbnail && <img src={canvas.thumbnail} alt={canvas.label} className="h-20 w-full rounded object-cover" />}
            </button>
          ))}
        </aside>

        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between rounded border bg-white p-2">
            <button className="rounded border px-3 py-1" disabled={currentCanvasIndex === 0} onClick={() => setCurrentCanvasIndex((v) => Math.max(v - 1, 0))}>← 前のページ</button>
            <div className="text-sm">{`${currentCanvasIndex + 1} / ${project.manifest.canvases.length}`}</div>
            <button className="rounded border px-3 py-1" disabled={currentCanvasIndex >= project.manifest.canvases.length - 1} onClick={() => setCurrentCanvasIndex((v) => Math.min(v + 1, project.manifest.canvases.length - 1))}>次のページ →</button>
          </div>
          <div className="min-h-0 flex-1">
            <ImageAnnotator
              canvas={currentCanvas}
              annotations={currentAnnotations}
              selectedId={selectedId}
              drawMode={drawMode}
              onSelect={setSelectedId}
              onCreate={onCreateAnnotation}
              onUpdate={onUpdateAnnotation}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded border bg-white p-2">
          <h2 className="mb-2 font-medium">アノテーション一覧</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {currentAnnotations.map((anno, index) => (
              <button
                key={anno.id}
                className={`mb-1 block w-full rounded border p-2 text-left text-sm ${selectedId === anno.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                onClick={() => setSelectedId(anno.id)}
              >
                <div className="font-medium">#{index + 1}</div>
                <div>{preview(anno.text)}</div>
              </button>
            ))}
          </div>

          <div className="mt-2 border-t pt-2">
            <h3 className="mb-1 text-sm font-medium">編集</h3>
            <label className="mb-1 block text-xs text-slate-600">デフォルト言語</label>
            <input className="mb-2 w-full rounded border px-2 py-1 text-sm" value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} placeholder="ja" />
            {selected ? (
              <>
                <label className="mb-1 block text-xs text-slate-600">テキスト</label>
                <textarea className="mb-2 h-28 w-full rounded border p-2 text-sm" value={selected.text} onChange={(e) => onUpdateAnnotation(selected.id, { text: e.target.value })} />
                <label className="mb-1 block text-xs text-slate-600">言語コード</label>
                <input className="mb-2 w-full rounded border px-2 py-1 text-sm" value={selected.language} onChange={(e) => onUpdateAnnotation(selected.id, { language: e.target.value })} placeholder="ja" />
                <button className="rounded bg-red-600 px-3 py-1 text-sm text-white" onClick={onDeleteSelected}>削除</button>
              </>
            ) : <p className="text-sm text-slate-500">アノテーションを選択すると編集できます。</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
