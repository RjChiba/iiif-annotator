'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadUserSettings, saveUserSettings, UserSettings } from '@/lib/settings';
import { OcrSchema, BboxConfig, CanvasMatchConfig, NDL_OCR_SCHEMA } from '@/lib/ocr-schema';

type BboxType = BboxConfig['type'];
type CanvasMatchType = CanvasMatchConfig['type'];

type SchemaFormState = {
  name: string;
  itemsPath: string;
  itemsFlat: boolean;
  textPath: string;
  bboxType: BboxType;
  bboxPath: string;       // quad / xywh-array
  bboxX: string; bboxY: string; bboxW: string; bboxH: string; // xywh
  bboxLeft: string; bboxTop: string; bboxRight: string; bboxBottom: string; // ltrb
  imageWidthPath: string;
  imageHeightPath: string;
  confidencePath: string;
  canvasMatchType: CanvasMatchType | 'auto';
  canvasMatchZeroBased: boolean;   // for filename-numeric-suffix
  canvasMatchPath: string;         // for json-path
  jsonSchemaText: string;          // JSON Schema as editable text
};

const emptyForm = (): SchemaFormState => ({
  name: '',
  itemsPath: '',
  itemsFlat: false,
  textPath: 'text',
  bboxType: 'xywh-array',
  bboxPath: '',
  bboxX: '', bboxY: '', bboxW: '', bboxH: '',
  bboxLeft: '', bboxTop: '', bboxRight: '', bboxBottom: '',
  imageWidthPath: '',
  imageHeightPath: '',
  confidencePath: '',
  canvasMatchType: 'auto',
  canvasMatchZeroBased: true,
  canvasMatchPath: '',
  jsonSchemaText: '',
});

const schemaToForm = (s: OcrSchema): SchemaFormState => {
  const base = emptyForm();
  base.name = s.name;
  base.itemsPath = s.itemsPath;
  base.itemsFlat = s.itemsFlat;
  base.textPath = s.textPath;
  base.imageWidthPath = s.imageWidthPath ?? '';
  base.imageHeightPath = s.imageHeightPath ?? '';
  base.confidencePath = s.confidencePath ?? '';
  base.bboxType = s.bbox.type;
  if (s.bbox.type === 'quad' || s.bbox.type === 'xywh-array') {
    base.bboxPath = s.bbox.path;
  } else if (s.bbox.type === 'xywh') {
    base.bboxX = s.bbox.x; base.bboxY = s.bbox.y; base.bboxW = s.bbox.w; base.bboxH = s.bbox.h;
  } else if (s.bbox.type === 'ltrb') {
    base.bboxLeft = s.bbox.left; base.bboxTop = s.bbox.top; base.bboxRight = s.bbox.right; base.bboxBottom = s.bbox.bottom;
  }
  if (!s.canvasMatch) {
    base.canvasMatchType = 'auto';
  } else {
    base.canvasMatchType = s.canvasMatch.type;
    if (s.canvasMatch.type === 'filename-numeric-suffix') {
      base.canvasMatchZeroBased = s.canvasMatch.zeroBased;
    } else if (s.canvasMatch.type === 'json-path') {
      base.canvasMatchPath = s.canvasMatch.path;
    }
  }
  base.jsonSchemaText = s.jsonSchema ? JSON.stringify(s.jsonSchema, null, 2) : '';
  return base;
};

const formToSchema = (form: SchemaFormState): Omit<OcrSchema, 'id'> => {
  let bbox: BboxConfig;
  if (form.bboxType === 'quad') bbox = { type: 'quad', path: form.bboxPath };
  else if (form.bboxType === 'xywh-array') bbox = { type: 'xywh-array', path: form.bboxPath };
  else if (form.bboxType === 'xywh') bbox = { type: 'xywh', x: form.bboxX, y: form.bboxY, w: form.bboxW, h: form.bboxH };
  else bbox = { type: 'ltrb', left: form.bboxLeft, top: form.bboxTop, right: form.bboxRight, bottom: form.bboxBottom };

  let canvasMatch: CanvasMatchConfig | undefined;
  if (form.canvasMatchType === 'filename-label') {
    canvasMatch = { type: 'filename-label' };
  } else if (form.canvasMatchType === 'filename-numeric-suffix') {
    canvasMatch = { type: 'filename-numeric-suffix', zeroBased: form.canvasMatchZeroBased };
  } else if (form.canvasMatchType === 'json-path') {
    canvasMatch = { type: 'json-path', path: form.canvasMatchPath };
  }

  let jsonSchema: Record<string, unknown> | undefined;
  if (form.jsonSchemaText.trim()) {
    try { jsonSchema = JSON.parse(form.jsonSchemaText); } catch { /* ignore invalid JSON */ }
  }

  return {
    name: form.name,
    itemsPath: form.itemsPath,
    itemsFlat: form.itemsFlat,
    textPath: form.textPath,
    bbox,
    ...(form.imageWidthPath ? { imageWidthPath: form.imageWidthPath } : {}),
    ...(form.imageHeightPath ? { imageHeightPath: form.imageHeightPath } : {}),
    ...(form.confidencePath ? { confidencePath: form.confidencePath } : {}),
    ...(canvasMatch ? { canvasMatch } : {}),
    ...(jsonSchema ? { jsonSchema } : {}),
  };
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    safeDelete: true,
    keyR: true,
    keyP: true,
    keyX: true
  });
  const [schemas, setSchemas] = useState<OcrSchema[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing, '__new__' = creating
  const [form, setForm] = useState<SchemaFormState>(emptyForm());
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadUserSettings());
    void refreshSchemas();
  }, []);

  const refreshSchemas = async () => {
    const res = await fetch('/api/ocr-schemas');
    const data = await res.json() as OcrSchema[];
    setSchemas(data);
  };

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveUserSettings(next);
  };

  const startCreate = () => {
    setForm(emptyForm());
    setEditingId('__new__');
    setSchemaError(null);
  };

  const startEdit = (s: OcrSchema) => {
    setForm(schemaToForm(s));
    setEditingId(s.id);
    setSchemaError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSchemaError(null);
  };

  const saveSchema = async () => {
    if (!form.name.trim()) { setSchemaError('スキーマ名は必須です。'); return; }
    setSchemaError(null);
    const payload = formToSchema(form);
    if (editingId === '__new__') {
      await fetch('/api/ocr-schemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/ocr-schemas/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, id: editingId }),
      });
    }
    setEditingId(null);
    await refreshSchemas();
  };

  const deleteSchema = async (id: string) => {
    if (!window.confirm('このスキーマを削除しますか？')) return;
    await fetch(`/api/ocr-schemas/${id}`, { method: 'DELETE' });
    await refreshSchemas();
  };

  const setF = (patch: Partial<SchemaFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const inputClass = 'w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-blue-400';
  const labelClass = 'block text-xs text-slate-600 mb-1';

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-400">
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-600"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{value ? 'ON' : 'OFF'}</span>
    </label>
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200/70 p-4 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">設定</h1>
              <p className="mt-1 text-sm text-slate-600">操作挙動の設定を変更できます。</p>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400"
            >
              ← プロジェクト一覧
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">safe-delete mode</h2>
              <p className="mt-1 text-sm text-slate-600">
                ON: 削除時に確認ダイアログを表示します。OFF: 確認なしで即時削除します。
              </p>
            </div>
            <Toggle value={settings.safeDelete} onChange={(v) => update({ safeDelete: v })} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">キーボードショートカット</h2>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-sm">r</kbd>
                  <span className="text-sm font-medium">編集モードへ切り替え</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">BBox を描画・編集するモードに切り替えます。</p>
              </div>
              <Toggle value={settings.keyR} onChange={(v) => update({ keyR: v })} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-sm">p</kbd>
                  <span className="text-sm font-medium">閲覧モードへ切り替え</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">アノテーションを閲覧・選択するモードに切り替えます。</p>
              </div>
              <Toggle value={settings.keyP} onChange={(v) => update({ keyP: v })} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-sm">x</kbd>
                  <span className="text-sm font-medium">選択中のアノテーションを削除</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">現在選択しているアノテーションを削除します。</p>
              </div>
              <Toggle value={settings.keyX} onChange={(v) => update({ keyX: v })} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">OCR スキーマ管理</h2>
              <p className="mt-1 text-sm text-slate-600">任意の OCR JSON フォーマットをアノテーションに変換するスキーマを管理します。</p>
            </div>
            {editingId === null && (
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                onClick={startCreate}
              >
                新規スキーマを追加
              </button>
            )}
          </div>

          {/* Built-in schema (read-only) */}
          <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <span className="text-sm font-medium">{NDL_OCR_SCHEMA.name}</span>
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">組み込み</span>
            </div>
          </div>

          {/* Custom schemas */}
          {schemas.length === 0 && editingId === null && (
            <p className="py-4 text-center text-sm text-slate-500">カスタムスキーマはありません。</p>
          )}
          {schemas.map((s) => (
            <div key={s.id} className="mb-2 last:mb-0">
              {editingId === s.id ? (
                <SchemaForm
                  form={form}
                  setF={setF}
                  onSave={saveSchema}
                  onCancel={cancelEdit}
                  error={schemaError}
                  inputClass={inputClass}
                  labelClass={labelClass}
                />
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <span className="text-sm font-medium">{s.name}</span>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm transition hover:border-slate-400"
                      onClick={() => startEdit(s)}
                    >
                      編集
                    </button>
                    <button
                      className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition hover:bg-red-500"
                      onClick={() => void deleteSchema(s.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {editingId === '__new__' && (
            <div className="mt-2">
              <SchemaForm
                form={form}
                setF={setF}
                onSave={saveSchema}
                onCancel={cancelEdit}
                error={schemaError}
                inputClass={inputClass}
                labelClass={labelClass}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SchemaForm({
  form,
  setF,
  onSave,
  onCancel,
  error,
  inputClass,
  labelClass,
}: {
  form: SchemaFormState;
  setF: (patch: Partial<SchemaFormState>) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
  inputClass: string;
  labelClass: string;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div>
        <label className={labelClass}>スキーマ名 *</label>
        <input className={inputClass} value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="例: My OCR" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>アイテムリストのパス <span className="text-slate-400">（ドット記法、空=ルート配列）</span></label>
          <input className={inputClass} value={form.itemsPath} onChange={(e) => setF({ itemsPath: e.target.value })} placeholder="例: contents" />
        </div>
        <div className="flex items-end">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-slate-400">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={form.itemsFlat}
              onChange={(e) => setF({ itemsFlat: e.target.checked })}
            />
            <span>アイテムが配列の配列になっている <span className="text-slate-400 text-xs">例: [[item, item], [item]]</span></span>
          </label>
        </div>
      </div>

      <div>
        <label className={labelClass}>テキストフィールドパス *</label>
        <input className={inputClass} value={form.textPath} onChange={(e) => setF({ textPath: e.target.value })} placeholder="例: text" />
      </div>

      <div>
        <label className={labelClass}>BBox 形式</label>
        <select
          className={inputClass}
          value={form.bboxType}
          onChange={(e) => setF({ bboxType: e.target.value as BboxType })}
        >
          <option value="quad">quad — [[x,y],[x,y],[x,y],[x,y]]</option>
          <option value="xywh-array">xywh-array — [x, y, w, h]</option>
          <option value="xywh">xywh — 別フィールド (x, y, w, h)</option>
          <option value="ltrb">ltrb — 別フィールド (left, top, right, bottom)</option>
        </select>
      </div>

      {(form.bboxType === 'quad' || form.bboxType === 'xywh-array') && (
        <div>
          <label className={labelClass}>BBox フィールドパス</label>
          <input className={inputClass} value={form.bboxPath} onChange={(e) => setF({ bboxPath: e.target.value })} placeholder="例: boundingBox" />
        </div>
      )}
      {form.bboxType === 'xywh' && (
        <div className="grid grid-cols-4 gap-2">
          {(['bboxX', 'bboxY', 'bboxW', 'bboxH'] as const).map((key, i) => (
            <div key={key}>
              <label className={labelClass}>{['x', 'y', 'w', 'h'][i]} パス</label>
              <input className={inputClass} value={form[key]} onChange={(e) => setF({ [key]: e.target.value })} placeholder={['x', 'y', 'w', 'h'][i]} />
            </div>
          ))}
        </div>
      )}
      {form.bboxType === 'ltrb' && (
        <div className="grid grid-cols-4 gap-2">
          {(['bboxLeft', 'bboxTop', 'bboxRight', 'bboxBottom'] as const).map((key, i) => (
            <div key={key}>
              <label className={labelClass}>{['left', 'top', 'right', 'bottom'][i]} パス</label>
              <input className={inputClass} value={form[key]} onChange={(e) => setF({ [key]: e.target.value })} placeholder={['left', 'top', 'right', 'bottom'][i]} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>画像幅パス（省略可）</label>
          <input className={inputClass} value={form.imageWidthPath} onChange={(e) => setF({ imageWidthPath: e.target.value })} placeholder="例: imginfo.img_width" />
        </div>
        <div>
          <label className={labelClass}>画像高さパス（省略可）</label>
          <input className={inputClass} value={form.imageHeightPath} onChange={(e) => setF({ imageHeightPath: e.target.value })} placeholder="例: imginfo.img_height" />
        </div>
      </div>

      <div>
        <label className={labelClass}>確信度パス（省略可）</label>
        <input className={inputClass} value={form.confidencePath} onChange={(e) => setF({ confidencePath: e.target.value })} placeholder="例: confidence" />
      </div>

      <div className="border-t border-blue-200 pt-3">
        <label className={labelClass}>Canvas マッチ方法</label>
        <select
          className={inputClass}
          value={form.canvasMatchType}
          onChange={(e) => setF({ canvasMatchType: e.target.value as SchemaFormState['canvasMatchType'] })}
        >
          <option value="auto">自動（ファイル名ラベル → 末尾番号）</option>
          <option value="filename-label">ファイル名ラベル（完全一致）</option>
          <option value="filename-numeric-suffix">ファイル名末尾番号（_NNNNN）</option>
          <option value="json-path">JSON 内フィールドでマッチ</option>
        </select>
        {form.canvasMatchType === 'filename-numeric-suffix' && (
          <div className="mt-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-slate-400">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={form.canvasMatchZeroBased}
                onChange={(e) => setF({ canvasMatchZeroBased: e.target.checked })}
              />
              <span>0始まり（_00000 = 1ページ目）</span>
            </label>
          </div>
        )}
        {form.canvasMatchType === 'json-path' && (
          <div className="mt-2">
            <label className={labelClass}>JSON 内マッチフィールドパス</label>
            <input className={inputClass} value={form.canvasMatchPath} onChange={(e) => setF({ canvasMatchPath: e.target.value })} placeholder="例: imginfo.img_name" />
          </div>
        )}
      </div>

      <div>
        <label className={labelClass}>
          JSON Schema（省略可・参照用）
          <span className="ml-1 text-slate-400">— 入力データの構造を JSON Schema draft 2020-12 で記述</span>
        </label>
        <textarea
          className={`${inputClass} h-36 resize-y font-mono text-xs`}
          value={form.jsonSchemaText}
          onChange={(e) => setF({ jsonSchemaText: e.target.value })}
          placeholder={'{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": { ... }\n}'}
          spellCheck={false}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          onClick={onSave}
        >
          保存
        </button>
        <button
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm transition hover:border-slate-400"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
