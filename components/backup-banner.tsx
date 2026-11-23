"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { backupBanner, type BackupBanner as Banner } from "@/lib/backup-state";
import { BACKUP_CHANGED_EVENT } from "@/components/backup-section";

/** Red bar under the nav in the red backup states (files' UX 1.3). Never on /scan, so scanning is not interrupted. */
export function BackupBanner() {
  const pathname = usePathname();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.backupApi;
    if (!api) return;
    const info = await api.status();
    setRunning(info.busy);
    setBanner(backupBanner(info.status, info.newest?.manifest?.createdAt ?? null, new Date()));
  }, []);

  useEffect(() => {
    void refresh();
    // The Einstellungen block announces its own backups, so the bar disappears at once.
    window.addEventListener(BACKUP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_CHANGED_EVENT, refresh);
  }, [refresh, pathname]);

  if (!banner || pathname === "/scan" || pathname.startsWith("/scan/")) return null;

  async function handleCreate() {
    const api = window.backupApi;
    if (!api) return;
    setRunning(true);
    try {
      await api.create();
    } finally {
      window.dispatchEvent(new Event(BACKUP_CHANGED_EVENT));
    }
  }

  return (
    <div role="alert" className="flex items-center gap-3 border-b border-destructive/60 bg-destructive/10 px-4 py-2 text-sm">
      {banner.canCreate ? (
        <>
          <span>{banner.text}</span>
          <Button type="button" size="sm" variant="destructive" disabled={running} onClick={() => void handleCreate()}>
            {running ? "Sicherung läuft …" : "Jetzt sichern"}
          </Button>
        </>
      ) : (
        <Link href="/settings#sicherung" className="underline underline-offset-2">
          {banner.text}
        </Link>
      )}
    </div>
  );
}
