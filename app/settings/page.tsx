'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadUserSettings, saveUserSettings, UserSettings } from '@/lib/settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    safeDelete: true,
    keyR: true,
    keyP: true,
    keyX: true
  });

  useEffect(() => {
    setSettings(loadUserSettings());
  }, []);

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveUserSettings(next);
  };

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
      </div>
    </main>
  );
}
