import { loadPendingOutboxCount, loadShopSyncSettings, loadStuckOutboxCount } from "./actions";
import { SettingsForm } from "./settings-form";
import { BackupSection } from "@/components/backup-section";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, pendingCount, stuckCount] = await Promise.all([
    loadShopSyncSettings(),
    loadPendingOutboxCount(),
    loadStuckOutboxCount(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Einstellungen</h1>
      <BackupSection />
      <h2 className="text-lg font-semibold">Website-Abgleich</h2>
      <p className="text-sm text-muted-foreground">
        Verbindung zum Cloudflare-Backend des Online-Shops (asia-2go.ch). Die Geräte-ID und der
        Schlüssel kommen aus dem Setup-Skript des Backends — einmal dort ausführen, dann hier
        eintragen.
      </p>
      <SettingsForm initialSettings={settings} initialPendingCount={pendingCount} initialStuckCount={stuckCount} />
    </div>
  );
}
