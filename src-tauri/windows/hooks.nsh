Var RemoveGameForFunData

!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Install GameForFun"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "GameForFun helps you host Minecraft Java servers with playit.gg tunneling, player tools, backups, and performance controls.$\r$\n$\r$\nThis setup will install GameForFun and the required WebView2 runtime if needed."
!endif
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "GameForFun is ready"
!endif
!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "GameForFun has been installed. Open the app, install or select your Minecraft server, then use the Tunnel tab to share your server with friends."
!endif

BrandingText "GameForFun Installer"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparing GameForFun..."
  DetailPrint "Installing Minecraft hosting tools and desktop app files."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "GameForFun installed successfully."
  DetailPrint "Launch GameForFun from the Start Menu or desktop shortcut."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you also want to remove GameForFun data?$\r$\n$\r$\nThis includes app settings, playit.gg data, and the configured Minecraft server folder.$\r$\n$\r$\nChoose No to uninstall the app but keep your server files." IDYES do_cleanup IDNO skip_cleanup
  do_cleanup:
    StrCpy $RemoveGameForFunData "1"
    Goto done_choice
  skip_cleanup:
    StrCpy $RemoveGameForFunData "0"
  done_choice:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  StrCmp $RemoveGameForFunData "1" 0 done_post

  DetailPrint "Removing GameForFun settings, playit.gg data, and selected server files..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference=''SilentlyContinue'';$cfgPath=Join-Path $env:APPDATA ''mchost\config.json'';$serverPath=$null;if(Test-Path $cfgPath){try{$cfg=Get-Content -Raw $cfgPath | ConvertFrom-Json;$serverPath=$cfg.server_path}catch{}};Remove-Item -Recurse -Force (Join-Path $env:APPDATA ''mchost'');Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA ''mchost'');Remove-Item -Recurse -Force (Join-Path $env:APPDATA ''playit_gg'');Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA ''playit_gg'');if($serverPath -and (Test-Path $serverPath)){Remove-Item -Recurse -Force $serverPath}"'
  DetailPrint "GameForFun data cleanup finished."

  done_post:
!macroend
