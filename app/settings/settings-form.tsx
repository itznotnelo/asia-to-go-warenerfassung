"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import type { ShopSyncSettingsValue } from "@/lib/sync/types";
import type { SyncRunResult } from "@/lib/sync/runner";
import { syncAllNow, syncNow, updateShopSyncSettings } from "./actions";

interface SettingsFormProps {
  initialSettings: ShopSyncSettingsValue;
  initialPendingCount: number;
}

function describeResult(result: SyncRunResult): string {
  if (result.skippedNoSettings) return "Keine Verbindung eingerichtet.";
  const parts = [`${result.sent} veröffentlicht`];
  if (result.dropped > 0) parts.push(`${result.dropped} verworfen (zu oft fehlgeschlagen)`);
  if (result.failed > 0) parts.push(`${result.failed} fehlgeschlagen, wird erneut versucht`);
  if (result.ordersImported > 0) parts.push(`${result.ordersImported} neue Bestellung(en) abgeholt`);
  return parts.join(" · ");
}

export function SettingsForm({ initialSettings, initialPendingCount }: SettingsFormProps) {
  const [apiUrl, setApiUrl] = useState(initialSettings.apiUrl);
  const [deviceId, setDeviceId] = useState(initialSettings.deviceId);
  const [deviceKey, setDeviceKey] = useState(initialSettings.deviceKey);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await updateShopSyncSettings({ apiUrl, deviceId, deviceKey });
    setSaving(false);
    setMessage(result.ok ? "Gespeichert." : result.message);
  }

  async function handleSync(all: boolean) {
    setSyncing(true);
    setMessage(null);
    const result = all ? await syncAllNow() : await syncNow();
    setSyncing(false);
    setMessage(describeResult(result));
    setPendingCount(all || result.sent > 0 ? 0 : pendingCount);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Backend-URL</span>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://atg-shop.example.workers.dev"
            className={inputClass()}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Geräte-ID</span>
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="shop-pc" className={inputClass() + " font-numeric"} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Geräte-Schlüssel</span>
          <input
            value={deviceKey}
            onChange={(e) => setDeviceKey(e.target.value)}
            type="password"
            className={inputClass() + " font-numeric"}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {pendingCount === 0 ? "Alles veröffentlicht." : `${pendingCount} Artikel/Kategorien warten auf Synchronisierung.`}
        </p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" disabled={syncing} onClick={() => handleSync(false)}>
            {syncing ? "Synchronisiert …" : "Jetzt synchronisieren"}
          </Button>
          <Button type="button" variant="outline" disabled={syncing} onClick={() => handleSync(true)}>
            Alles synchronisieren
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
