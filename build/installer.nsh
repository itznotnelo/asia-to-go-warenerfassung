; Drops the stale "Asia To Go" entry that builds before 0.1.4 left in
; Apps & Features (appId was ch.nelo.asia-to-go until bb2b558).
;
; NSIS keys the uninstall entry on a UUIDv5 of the appId, but the install
; folder and the uninstaller file name come from productName. So on a PC that
; ran both, the two entries point at the same folder, and the old entry's
; "Uninstall" now launches the CURRENT uninstaller (same file name, overwritten
; by 0.1.4+): it would remove the live app and orphan the old entry anyway.
; Therefore never run anything here, only delete the old registry keys.
; App data (%APPDATA%\Asia To Go: pgdata, images, config.json) is not touched.

; UUIDv5("ch.nelo.asia-to-go", electron-builder namespace 50e065bc-3134-11e6-9bab-38c9862bdaf3)
!define LEGACY_APP_GUID "3fcebda7-9dce-54c8-ae7e-08407c4f28d9"
!define LEGACY_INSTALL_KEY "Software\${LEGACY_APP_GUID}"
!define LEGACY_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_APP_GUID}"

; Runs at the end of the install section, after the files and the current
; entry are written. Old builds were per-user too (perMachine: false), so HKCU.
!macro customInstall
  Push $R1
  Push $R2

  ReadRegStr $R1 HKCU "${LEGACY_UNINSTALL_KEY}" UninstallString
  ReadRegStr $R2 HKCU "${LEGACY_INSTALL_KEY}" InstallLocation
  ${if} $R2 == ""
  ${andIf} $R1 != ""
    !insertmacro GetInQuotes $R2 "$R1"
    Push $R2
    Call GetFileParent
    Pop $R2
  ${endIf}

  ${if} $R2 == "$INSTDIR"
    DeleteRegKey HKCU "${LEGACY_UNINSTALL_KEY}"
    DeleteRegKey HKCU "${LEGACY_INSTALL_KEY}"
    DetailPrint "Removed stale pre-0.1.4 'Asia To Go' entry"
  ${elseif} $R1 != ""
    ; A copy in another folder is a real second install: leave it for a human.
    DetailPrint "Pre-0.1.4 'Asia To Go' entry at $R2 left in place"
  ${endIf}
  ClearErrors

  Pop $R2
  Pop $R1
!macroend

; ---------------------------------------------------------------------------
; Fast removal of the old app folder (v0.3.1, fixes the 17+ min update hang).
;
; On an update electron-builder's OLD uninstaller "atomically" moves every
; single file of the old install into %TEMP% (un.atomicRMDir: one NSIS Rename
; per file, one CreateDirectory per folder), then deletes it. resources\ holds
; the Next standalone server and the Electron app's node_modules (prisma,
; embedded-postgres): well over 20'000 files with deep pnpm paths. That loop
; takes many minutes with Defender scanning each move, and a path that gets
; too long under %TEMP% makes the rename fail, the uninstaller restores and
; aborts, and the installer retries it up to five times.
;
; So before the old uninstaller runs, delete resources\ in one native call
; (`rd /s /q` with the \\?\ prefix, which has no MAX_PATH limit). The old
; uninstaller then only moves the ~100 Electron runtime files that are left.
; Only the program folder is touched; data in %APPDATA%\Asia To Go stays.
; ---------------------------------------------------------------------------
!macro atgFastRemoveResources DIR
  ${if} ${FileExists} "${DIR}\${APP_EXECUTABLE_FILENAME}"
  ${andIf} ${FileExists} "${DIR}\resources\*.*"
    DetailPrint "Removing old program files in ${DIR}\resources"
    nsExec::Exec `"$SYSDIR\cmd.exe" /C rd /s /q "\\?\${DIR}\resources"`
    Pop $0
    ${if} ${FileExists} "${DIR}\resources\*.*"
      ; Something was still locked: the default removal below handles the rest.
      DetailPrint "Old resources folder not fully removed (rd exit $0)"
    ${endIf}
    ClearErrors
  ${endIf}
!macroend

; Installer .onInit. Only for the silent auto-update (--updated): the app has
; just called quitAndInstall and is shutting down (Next server, Postgres). Wait
; up to 30 s for every process started from the install folder to exit, end
; the rest, then drop resources\ before uninstallOldVersion runs. A manual
; install keeps electron-builder's normal "app is running" prompt.
!macro customInit
  ${if} ${isUpdated}
  ${andIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    Push $0
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -C "$$d = '$INSTDIR\'; function Get-AppProcs { Get-CimInstance -ClassName Win32_Process | ? { $$_.Path -and $$_.Path.StartsWith($$d, 'CurrentCultureIgnoreCase') } }; for ($$i = 0; $$i -lt 30 -and (Get-AppProcs); $$i++) { Start-Sleep -Seconds 1 }; Get-AppProcs | % { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 500"`
    Pop $0
    ${if} $0 == "error"
      ; No PowerShell: give the app a moment to quit on its own.
      Sleep 5000
    ${endIf}
    !insertmacro atgFastRemoveResources "$INSTDIR"
    Pop $0
  ${endIf}
!macroend

; Uninstaller (also the one a later update runs as "old uninstaller"): same
; fast removal before electron-builder's per-file move.
!macro customUnInstall
  Push $0
  !insertmacro atgFastRemoveResources "$INSTDIR"
  Pop $0
!macroend
