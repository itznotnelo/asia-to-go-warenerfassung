import { loadPendingOutboxCount, loadShopSyncSettings, loadStuckOutboxCount } from "./actions";
import { SettingsForm } from "./settings-form";
import { BackupSection } from "@/components/backup-section";
import { SyncPausedBox } from "@/components/sync-paused-box";
import { readSafetyBuffer } from "@/lib/stock/settings";
import { SafetyBufferForm } from "./safety-buffer-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, pendingCount, stuckCount, safetyBuffer] = await Promise.all([
    loadShopSyncSettings(),
    loadPendingOutboxCount(),
    loadStuckOutboxCount(),
    readSafetyBuffer(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Einstellungen</h1>
      <BackupSection />
      {/* Readable list for Excel (files #3066); not a backup, so outside the Datensicherung block. */}
      <a
        href="/api/export?format=excel"
        className="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        Für Excel exportieren
      </a>
      {/* Not a backup, so kept apart from Datensicherung and closed by default (files' UX 1.1). */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Weitere Exporte</summary>
        <div className="mt-2 flex gap-3">
          <a href="/api/export?format=json" className="text-primary hover:underline">
            Export JSON
          </a>
          <a href="/api/export?format=csv" className="text-primary hover:underline">
            Export CSV
          </a>
        </div>
      </details>
      <h2 className="text-lg font-semibold">Website-Abgleich</h2>
      <p className="text-sm text-muted-foreground">
        Verbindung zum Cloudflare-Backend des Online-Shops (asia-2go.ch). Die Geräte-ID und der
        Schlüssel kommen aus dem Setup-Skript des Backends: einmal dort ausführen, dann hier
        eintragen.
      </p>
      <SyncPausedBox />
      <SettingsForm initialSettings={settings} initialPendingCount={pendingCount} initialStuckCount={stuckCount} />
      <h2 className="text-lg font-semibold">Lager und Webshop</h2>
      <SafetyBufferForm initial={safetyBuffer} />
    </div>
  );
}
