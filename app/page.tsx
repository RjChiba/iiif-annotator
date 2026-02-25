'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { parseManifest } from '@/lib/iiif';
import { AnnotationData, ManifestState } from '@/lib/types';
import ImageAnnotator from '@/components/ImageAnnotator';
import { clearStoredData, loadStoredData, saveStoredData } from '@/lib/storage';
import { buildManifestWithAnnotations, downloadJson } from '@/lib/export';

const preview = (text: string) => (text.length > 24 ? `${text.slice(0, 24)}...` : text || '（未入力）');

export default function Home() {
  const [manifestUrl, setManifestUrl] = useState('');
  const [manifest, setManifest] = useState<ManifestState | null>(null);
  const [rawManifest, setRawManifest] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotationsByCanvas, setAnnotationsByCanvas] = useState<Record<string, AnnotationData[]>>({});
  const [currentCanvasIndex, setCurrentCanvasIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [drawMode, setDrawMode] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState('ja');

  const currentCanvas = manifest?.canvases[currentCanvasIndex];
  const currentAnnotations = useMemo(() => {
    if (!currentCanvas) return [];
    return [...(annotationsByCanvas[currentCanvas.id] || [])].sort((a, b) => a.y - b.y);
  }, [annotationsByCanvas, currentCanvas]);

  const selected = currentAnnotations.find((a) => a.id === selectedId);

  const applyManifest = (next: ManifestState) => {
    setManifest(next);
    setCurrentCanvasIndex(0);
    setSelectedId(undefined);

    const fromManifest = Object.fromEntries(
      next.canvases.map((canvas) => [canvas.id, [...canvas.existingAnnotations]])
    ) as Record<string, AnnotationData[]>;

    const stored = loadStoredData(next.sourceKey);
    if (stored) {
      setAnnotationsByCanvas(stored.annotationsByCanvas);
      setDefaultLanguage(stored.defaultLanguage || 'ja');
      setCurrentCanvasIndex(Math.min(stored.currentCanvasIndex || 0, next.canvases.length - 1));
    } else {
      setAnnotationsByCanvas(fromManifest);
    }
  };

  const loadManifestFromObject = (json: unknown, sourceKey: string) => {
    try {
      const parsed = parseManifest(json, sourceKey);
      setError(null);
      setRawManifest(json);
      applyManifest(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Manifest を読み込めませんでした。');
    }
  };

  const onLoadUrl = async () => {
    if (!manifestUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(manifestUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      loadManifestFromObject(json, `url:${manifestUrl.trim()}`);
    } catch (e) {
      setError('Manifest の読み込みに失敗しました。CORS 設定または URL を確認してください。');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      loadManifestFromObject(json, `file:${file.name}`);
    } catch {
      setError('JSON の解析に失敗しました。manifest.json を確認してください。');
    }
  };

  useEffect(() => {
    if (!manifest) return;
    saveStoredData(manifest.sourceKey, { defaultLanguage, annotationsByCanvas, currentCanvasIndex });
  }, [annotationsByCanvas, currentCanvasIndex, defaultLanguage, manifest]);

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if (!manifest) return;
      if (event.key === 'ArrowRight') setCurrentCanvasIndex((prev) => Math.min(prev + 1, manifest.canvases.length - 1));
      if (event.key === 'ArrowLeft') setCurrentCanvasIndex((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [manifest]);

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

  const onClearStored = () => {
    if (!manifest) return;
    clearStoredData(manifest.sourceKey);
  };

  const exportAll = () => {
    if (!manifest || !rawManifest) return;
    const result = buildManifestWithAnnotations(rawManifest, annotationsByCanvas);
    downloadJson('manifest-annotated.json', result);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      loadManifestFromObject(json, `file:${file.name}`);
    } catch {
      setError('ドラッグ＆ドロップしたファイルの読み込みに失敗しました。');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="mb-4 rounded border bg-white p-3">
        <h1 className="text-lg font-semibold">IIIF テキスト文字起こしアノテーションツール</h1>
        <p className="text-sm text-slate-600">Manifest URL または manifest.json を読み込んで編集できます。</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="min-w-80 flex-1 rounded border px-3 py-2" value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)} placeholder="https://example.org/manifest.json" />
          <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={onLoadUrl} disabled={loading}>{loading ? '読み込み中...' : 'URL読込'}</button>
          <label className="cursor-pointer rounded border px-4 py-2">
            ファイル読込
            <input type="file" accept="application/json,.json" className="hidden" onChange={onUpload} />
          </label>
          <button className="rounded border px-3 py-2" onClick={onClearStored} disabled={!manifest}>保存データをクリア</button>
          <button className="rounded border px-3 py-2" onClick={() => setDrawMode((v) => !v)} disabled={!manifest}>{drawMode ? '閲覧モード' : '描画モード'}</button>
          <button className="rounded border px-3 py-2" onClick={exportAll} disabled={!manifest}>Manifestを書き出し</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid h-[calc(100vh-170px)] grid-cols-[18rem_1fr_22rem] gap-3">
        <aside className="overflow-y-auto rounded border bg-white p-2">
          <h2 className="mb-2 font-medium">Canvas 一覧</h2>
          {manifest?.canvases.map((canvas, index) => (
            <button
              key={canvas.id}
              className={`mb-2 block w-full rounded border p-2 text-left text-sm ${index === currentCanvasIndex ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
              onClick={() => { setCurrentCanvasIndex(index); setSelectedId(undefined); }}
            >
              <div className="mb-1 font-medium">{index + 1}. {canvas.label}</div>
              {canvas.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={canvas.thumbnail} alt={canvas.label} className="h-20 w-full rounded object-cover" />
              )}
            </button>
          ))}
        </aside>

        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between rounded border bg-white p-2">
            <button className="rounded border px-3 py-1" disabled={!manifest || currentCanvasIndex === 0} onClick={() => setCurrentCanvasIndex((v) => Math.max(v - 1, 0))}>← 前のページ</button>
            <div className="text-sm">{manifest ? `${currentCanvasIndex + 1} / ${manifest.canvases.length}` : '0 / 0'}</div>
            <button className="rounded border px-3 py-1" disabled={!manifest || !manifest.canvases.length || currentCanvasIndex >= manifest.canvases.length - 1} onClick={() => setCurrentCanvasIndex((v) => Math.min(v + 1, (manifest?.canvases.length || 1) - 1))}>次のページ →</button>
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
                <textarea
                  className="mb-2 h-28 w-full rounded border p-2 text-sm"
                  value={selected.text}
                  onChange={(e) => onUpdateAnnotation(selected.id, { text: e.target.value })}
                />
                <label className="mb-1 block text-xs text-slate-600">言語コード</label>
                <input className="mb-2 w-full rounded border px-2 py-1 text-sm" value={selected.language} onChange={(e) => onUpdateAnnotation(selected.id, { language: e.target.value })} placeholder="ja" />
                <button className="rounded bg-red-600 px-3 py-1 text-sm text-white" onClick={onDeleteSelected}>削除</button>
              </>
            ) : (
              <p className="text-sm text-slate-500">アノテーションを選択すると編集できます。</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
