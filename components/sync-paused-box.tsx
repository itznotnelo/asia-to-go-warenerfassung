"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * sync.pausedAfterRestore (files' UX R4a): after a restore the background
 * sync stays off until someone presses the button. Desktop app only.
 */
export function SyncPausedBox() {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void window.backupApi?.status().then((s) => setPaused(Boolean(s.syncPausedSince)));
  }, []);

  if (!paused) return null;

  async function handleSend() {
    if (!window.backupApi) return;
    setSending(true);
    setFailed(false);
    const { ok } = await window.backupApi.resumeSync();
    setSending(false);
    if (!ok) return setFailed(true);
    setPaused(false);
    router.refresh();
  }

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-orange-500/60 bg-orange-500/10 px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-3">
        Website-Abgleich angehalten seit dem Zurückholen.
        <Button type="button" size="sm" disabled={sending} onClick={() => void handleSend()}>
          {sending ? "Wird gesendet …" : "Jetzt neu senden"}
        </Button>
      </p>
      {failed && <p className="text-destructive">Senden hat nicht geklappt. Bitte später nochmals versuchen.</p>}
    </div>
  );
}
