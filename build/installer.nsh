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
