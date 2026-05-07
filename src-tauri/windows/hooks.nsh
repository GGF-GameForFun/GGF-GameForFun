Var RemoveGameForFunData

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove all GameForFun data (settings, playit data, and configured Minecraft server files)?" IDYES do_cleanup IDNO skip_cleanup
  do_cleanup:
    StrCpy $RemoveGameForFunData "1"
    Goto done_choice
  skip_cleanup:
    StrCpy $RemoveGameForFunData "0"
  done_choice:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  StrCmp $RemoveGameForFunData "1" 0 done_post

  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference=''SilentlyContinue'';$cfgPath=Join-Path $env:APPDATA ''mchost\config.json'';$serverPath=$null;if(Test-Path $cfgPath){try{$cfg=Get-Content -Raw $cfgPath | ConvertFrom-Json;$serverPath=$cfg.server_path}catch{}};Remove-Item -Recurse -Force (Join-Path $env:APPDATA ''mchost'');Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA ''mchost'');Remove-Item -Recurse -Force (Join-Path $env:APPDATA ''playit_gg'');Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA ''playit_gg'');if($serverPath -and (Test-Path $serverPath)){Remove-Item -Recurse -Force $serverPath}"'

  done_post:
!macroend
