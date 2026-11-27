import { loadPendingOutboxCount, loadShopSyncSettings, loadStuckOutboxCount } from "./actions";
import { SettingsForm } from "./settings-form";
import { BackupSection } from "@/components/backup-section";
import { SyncPausedBox } from "@/components/sync-paused-box";
import { readSafetyBuffer } from "@/lib/stock/settings";
import { SafetyBufferForm } from "./safety-buffer-form";
import { PageHeader, SectionTitle, pageClass } from "@/components/page";
import { buttonVariants } from "@/components/ui/button-variants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, pendingCount, stuckCount, safetyBuffer] = await Promise.all([
    loadShopSyncSettings(),
    loadPendingOutboxCount(),
    loadStuckOutboxCount(),
    readSafetyBuffer(),
  ]);

  return (
    <main className={pageClass()}>
      <PageHeader title="Einstellungen" description="Datensicherung, Exporte und die Verbindung zum Webshop." />

      {/* One column of settings; long fields stay readable instead of 1000 px wide. */}
      <div className="flex max-w-2xl flex-col gap-10">
        <BackupSection />

        <section className="flex flex-col gap-3">
          <SectionTitle title="Exporte" />
          {/* Readable list for Excel (files #3066); not a backup, so outside the Datensicherung block. */}
          <a href="/api/export?format=excel" className={buttonVariants({ variant: "outline" }) + " self-start"}>
            Für Excel exportieren
          </a>
          {/* Not a backup, so kept apart from Datensicherung and closed by default (files' UX 1.1). */}
          <details className="text-sm">
            <summary className="cursor-pointer py-3 text-muted-foreground hover:text-foreground">Weitere Exporte</summary>
            <div className="flex gap-2">
              <a href="/api/export?format=json" className={buttonVariants({ variant: "ghost" })}>
                Export JSON
              </a>
              <a href="/api/export?format=csv" className={buttonVariants({ variant: "ghost" })}>
                Export CSV
              </a>
            </div>
          </details>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <SectionTitle title="Website-Abgleich" />
            <p className="text-sm text-muted-foreground">
              Verbindung zum Cloudflare-Backend des Online-Shops (asia-2go.ch). Die Geräte-ID und der
              Schlüssel kommen aus dem Setup-Skript des Backends: einmal dort ausführen, dann hier
              eintragen.
            </p>
          </div>
          <SyncPausedBox />
          <SettingsForm initialSettings={settings} initialPendingCount={pendingCount} initialStuckCount={stuckCount} />
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle title="Lager und Webshop" />
          <SafetyBufferForm initial={safetyBuffer} />
        </section>
      </div>
    </main>
  );
}
