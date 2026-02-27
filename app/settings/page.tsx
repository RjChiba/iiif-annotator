'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadUserSettings, saveUserSettings } from '@/lib/settings';

export default function SettingsPage() {
  const [safeDelete, setSafeDelete] = useState(true);

  useEffect(() => {
    setSafeDelete(loadUserSettings().safeDelete);
  }, []);

  const onSafeDeleteChange = (next: boolean) => {
    setSafeDelete(next);
    saveUserSettings({ safeDelete: next });
  };

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

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-400">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={safeDelete}
                onChange={(e) => onSafeDeleteChange(e.target.checked)}
              />
              <span>{safeDelete ? 'ON' : 'OFF'}</span>
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}
