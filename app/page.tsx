'use client';

import { ChangeEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseManifest } from '@/lib/iiif';
import { AnnotationData, ManifestState, ProjectMeta } from '@/lib/types';
import ImageAnnotator from '@/components/ImageAnnotator';
import { buildAnnotationPage, buildManifestWithAnnotations, downloadJson } from '@/lib/export';
import { parseNdlOcr, NdlOcrJson } from '@/lib/ndl-ocr';
import { ChevronLeft, ChevronRight, Layers, VectorSquare, View } from 'lucide-react';

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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [showCanvasList, setShowCanvasList] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBboxDragging = useRef(false);
  const currentAnnotationsRef = useRef<AnnotationData[]>([]);

  const currentCanvas = project?.manifest.canvases[currentCanvasIndex];
  const currentAnnotations = useMemo(() => {
    if (!currentCanvas) return [];
    return [...(annotationsByCanvas[currentCanvas.id] || [])].sort((a, b) => a.y - b.y);
  }, [annotationsByCanvas, currentCanvas]);
  currentAnnotationsRef.current = currentAnnotations;
  const selected = currentAnnotations.find((a) => a.id === selectedId);
  const annotationCountByCanvas = useMemo(
    () =>
      Object.fromEntries(
        project?.manifest.canvases.map((canvas) => [canvas.id, annotationsByCanvas[canvas.id]?.length ?? 0]) ?? []
      ),
    [project, annotationsByCanvas]
  );
  const iconButtonClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100';

  const goPrevCanvas = () => {
    setCurrentCanvasIndex((v) => Math.max(v - 1, 0));
    setSelectedId(undefined);
  };

  const goNextCanvas = () => {
    if (!project) return;
    setCurrentCanvasIndex((v) => Math.min(v + 1, project.manifest.canvases.length - 1));
    setSelectedId(undefined);
  };

  const refreshProjects = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects || []);
  };

  useEffect(() => {
    void refreshProjects();
    const projectId = searchParams.get('project');
    if (projectId) void loadProject(projectId);
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
      router.replace(`?project=${projectId}`, { scroll: false });
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

      const uploads: { url: string; filename: string; width: number; height: number }[] = [];
      for (const file of files) {
        if (file.type === 'application/pdf') {
          const form = new FormData();
          form.append('projectId', projectId);
          form.append('file', file);
          const res = await fetch('/api/pdf-to-images', { method: 'POST', body: form });
          if (!res.ok) throw new Error('PDF conversion failed');
          const { files: pdfFiles } = await res.json() as { files: { url: string; filename: string; width: number; height: number }[] };
          for (const pdfFile of pdfFiles) {
            uploads.push(pdfFile);
          }
        } else {
          const form = new FormData();
          form.append('projectId', projectId);
          form.append('file', file);
          const upload = await fetch('/api/upload', { method: 'POST', body: form });
          const uploaded = await upload.json();
          const dims = await loadImageDimensions(uploaded.url);
          uploads.push({ ...uploaded, ...dims });
        }
      }
      uploads.sort((a, b) => a.filename.localeCompare(b.filename));

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
    } catch(error) {
      console.log(error)
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
    if ('x' in updates || 'y' in updates || 'w' in updates || 'h' in updates) isBboxDragging.current = true;
    upsertAnnotation(currentCanvas.id, (current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const onBboxChangeEnd = () => {
    isBboxDragging.current = false;
    if (!project || !currentCanvas) return;
    void saveCanvasAnnotations(currentCanvasIndex, currentCanvas.id, currentAnnotationsRef.current);
  };

  const onDeleteSelected = () => {
    if (!selected || !currentCanvas) return;
    if (!window.confirm('このアノテーションを削除しますか？')) return;
    upsertAnnotation(currentCanvas.id, (current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(undefined);
  };

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const tag = (event.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [selected, currentCanvas]);

  useEffect(() => {
    if (!project || !currentCanvas || isBboxDragging.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveCanvasAnnotations(currentCanvasIndex, currentCanvas.id, currentAnnotations);
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [project, currentCanvasIndex, currentCanvas, currentAnnotations]);

  // prevent pagenation when user editing annotations
  // useEffect(() => {
  //   const listener = (event: globalThis.KeyboardEvent) => {
  //     if (!project) return;
  //     if (event.key === 'ArrowRight') setCurrentCanvasIndex((prev) => Math.min(prev + 1, project.manifest.canvases.length - 1));
  //     if (event.key === 'ArrowLeft') setCurrentCanvasIndex((prev) => Math.max(prev - 1, 0));
  //   };
  //   window.addEventListener('keydown', listener);
  //   return () => window.removeEventListener('keydown', listener);
  // }, [project]);

  const onImportNdlOcr = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || !project) return;
    const files = Array.from(event.target.files);
    event.target.value = '';
    const canvases = project.manifest.canvases;
    const accumulated: Record<string, AnnotationData[]> = {};
    const errors: string[] = [];

    for (const file of files) {
      try {
        const json = JSON.parse(await file.text()) as NdlOcrJson;
        const baseName = file.name.replace(/\.json$/i, '');

        // Primary match: canvas label equals JSON basename (without extension)
        let canvasIndex = canvases.findIndex((c) => c.label === baseName);

        // Fallback: extract trailing 1-based numeric index from filename (e.g. _00003 → canvas index 2)
        if (canvasIndex === -1) {
          const match = baseName.match(/_(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= 1 && num <= canvases.length) canvasIndex = num - 1;
          }
        }

        if (canvasIndex === -1) {
          errors.push(`${file.name}: 対応する Canvas が見つかりませんでした`);
          continue;
        }

        const canvas = canvases[canvasIndex];
        const imported = parseNdlOcr(json, canvas.id, defaultLanguage, {
          width: canvas.width,
          height: canvas.height,
        });
        const existing = accumulated[canvas.id] ?? annotationsByCanvas[canvas.id] ?? [];
        accumulated[canvas.id] = [...existing, ...imported];
      } catch {
        errors.push(`${file.name}: 解析に失敗しました`);
      }
    }

    if (Object.keys(accumulated).length > 0) {
      setAnnotationsByCanvas((prev) => ({ ...prev, ...accumulated }));
      // Save all updated canvases to the server
      for (const [canvasId, items] of Object.entries(accumulated)) {
        const idx = canvases.findIndex((c) => c.id === canvasId);
        if (idx !== -1) void saveCanvasAnnotations(idx, canvasId, items);
      }
    }

    setError(errors.length > 0 ? errors.join('\n') : null);
  };

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
      <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200/70 p-4 text-slate-900">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight">プロジェクト一覧</h1>
            <p className="mt-1 text-sm text-slate-600">既存プロジェクトを開くか、新規プロジェクトを作成してください。</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <h2 className="mb-2 text-sm font-semibold">新規プロジェクト作成</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400"
                  value={manifestUrl}
                  onChange={(e) => setManifestUrl(e.target.value)}
                  placeholder="https://example.org/manifest.json"
                />
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onLoadUrl}
                  disabled={loading}
                >
                  {loading ? '読み込み中...' : 'Manifest URL読込'}
                </button>
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm transition hover:border-slate-400">
                  Manifest ファイル
                  <input type="file" accept="application/json,.json" className="hidden" onChange={onUploadManifestFile} />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm transition hover:border-slate-400">
                  画像 / PDF アップロード
                  <input type="file" accept="image/jpeg,image/png,application/pdf" multiple className="hidden" onChange={onUploadFiles} />
                </label>
              </div>
              {projectBusy && <p className="mt-2 text-sm text-slate-600">アップロード処理中...</p>}
              {error && <p className="mt-2 whitespace-pre-wrap text-sm text-red-600">{error}</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {projects.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">プロジェクトがありません。</p>
            ) : (
              projects.map((p) => (
                <div key={p.id} className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 p-3 last:mb-0">
                  <button className="text-left" onClick={() => void loadProject(p.id.replace('urn:uuid:', ''))}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-600">
                      作成: {new Date(p.createdAt).toLocaleString()} / 更新: {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition hover:bg-red-500"
                    onClick={() => void onDeleteProject(p.id.replace('urn:uuid:', ''))}
                  >
                    削除
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200/70 text-slate-900">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-4 p-4">
        <header className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Project</p>
              <h1 className="text-xl font-semibold tracking-tight">{project.meta.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400"
                onClick={() => { setProject(null); router.replace('/', { scroll: false }); }}
              >
                ← プロジェクト一覧
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400"
                onClick={exportAll}
              >
                Manifestを書き出し
              </button>
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400">
                NDL OCR インポート
                <input type="file" accept="application/json,.json" multiple className="hidden" onChange={onImportNdlOcr} />
              </label>
            </div>
          </div>
          {error && <p className="mt-2 whitespace-pre-wrap text-sm text-red-600">{error}</p>}
        </header>

        <div className={`grid h-[calc(100vh-186px)] gap-3 ${showCanvasList ? 'grid-cols-[17rem_minmax(0,1fr)_21rem]' : 'grid-cols-[minmax(0,1fr)_21rem]'}`}>
          {showCanvasList && (
            <aside className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Canvas 一覧</h2>
              <div className="space-y-2">
                {project.manifest.canvases.map((canvas, index) => (
                  <button
                    key={canvas.id}
                    className={`block w-full rounded-xl border p-2 text-left text-sm transition ${
                      index === currentCanvasIndex
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => { setCurrentCanvasIndex(index); setSelectedId(undefined); }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{index + 1}. {canvas.label}</div>
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {annotationCountByCanvas[canvas.id] ?? 0}
                      </div>
                    </div>
                    {canvas.thumbnail && <img src={canvas.thumbnail} alt={canvas.label} className="h-20 w-full rounded-lg object-cover" />}
                  </button>
                ))}
              </div>
            </aside>
          )}

          <section className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  className={iconButtonClass}
                  onClick={() => setShowCanvasList((v) => !v)}
                  aria-label={showCanvasList ? 'Canvas 一覧を隠す' : 'Canvas 一覧を表示'}
                  title={showCanvasList ? 'Canvas 一覧を隠す' : 'Canvas 一覧を表示'}
                >
                  <Layers className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1 p-1">
                  <div className="group relative">
                    <button
                      className={`${iconButtonClass} ${
                        drawMode
                          ? 'border-blue-300 bg-blue-50 text-blue-700 disabled:border-blue-300 disabled:bg-blue-50 disabled:text-blue-700'
                          : ''
                      }`}
                      onClick={() => setDrawMode(true)}
                      disabled={drawMode}
                      aria-label="編集モード"
                    >
                      <VectorSquare className="h-4 w-4" />
                    </button>
                    <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                      編集モード
                    </span>
                  </div>
                  <div className="group relative">
                    <button
                      className={`${iconButtonClass} ${
                        !drawMode
                          ? 'border-blue-300 bg-blue-50 text-blue-700 disabled:border-blue-300 disabled:bg-blue-50 disabled:text-blue-700'
                          : ''
                      }`}
                      onClick={() => setDrawMode(false)}
                      disabled={!drawMode}
                      aria-label="閲覧モード"
                    >
                      <View className="h-4 w-4" />
                    </button>
                    <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                      閲覧モード
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {`${currentCanvasIndex + 1} / ${project.manifest.canvases.length}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={iconButtonClass}
                  disabled={currentCanvasIndex === 0}
                  onClick={goPrevCanvas}
                  aria-label="前のページ"
                  title="前のページ"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  className={iconButtonClass}
                  disabled={currentCanvasIndex >= project.manifest.canvases.length - 1}
                  onClick={goNextCanvas}
                  aria-label="次のページ"
                  title="次のページ"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="h-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 p-1">
                <ImageAnnotator
                  canvas={currentCanvas}
                  annotations={currentAnnotations}
                  selectedId={selectedId}
                  drawMode={drawMode}
                  onSelect={setSelectedId}
                  onCreate={onCreateAnnotation}
                  onUpdate={onUpdateAnnotation}
                  onBboxChangeEnd={onBboxChangeEnd}
                />
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="text-sm font-semibold">アノテーション一覧</h2>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {currentAnnotations.length === 0 ? (
                <p className="mt-8 text-center text-sm text-slate-500">この Canvas にアノテーションはありません。</p>
              ) : (
                currentAnnotations.map((anno, index) => (
                  <button
                    key={anno.id}
                    className={`mb-1 block w-full rounded-xl border p-2 text-left text-sm transition ${
                      selectedId === anno.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedId(anno.id)}
                  >
                    <div className="font-medium">#{index + 1}</div>
                    <div className="text-slate-700">{preview(anno.text)}</div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3">
              <h3 className="mb-1 text-sm font-medium">編集</h3>
              <label className="mb-1 block text-xs text-slate-600">デフォルト言語</label>
              <input
                className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-blue-400"
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                placeholder="ja"
              />
              {selected ? (
                <>
                  <label className="mb-1 block text-xs text-slate-600">テキスト</label>
                  <textarea
                    className="mb-2 h-28 w-full rounded-lg border border-slate-300 p-2 text-sm outline-none transition focus:border-blue-400"
                    value={selected.text}
                    onChange={(e) => onUpdateAnnotation(selected.id, { text: e.target.value })}
                  />
                  <label className="mb-1 block text-xs text-slate-600">言語コード</label>
                  <input
                    className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-blue-400"
                    value={selected.language}
                    onChange={(e) => onUpdateAnnotation(selected.id, { language: e.target.value })}
                    placeholder="ja"
                  />
                  <div className="flex flex-row gap-2">
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1 text-sm bg-white text-slate-900 transition hover:border-slate-300"
                      onClick={() => setSelectedId(undefined)}
                    >
                      保存
                    </button>
                    <button
                      className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition hover:bg-red-500"
                      onClick={onDeleteSelected}
                    >
                      削除
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">アノテーションを選択すると編集できます。</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
