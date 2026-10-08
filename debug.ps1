$ErrorActionPreference = 'Continue'
$out = Join-Path $env:TEMP 'jbtest-debug'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$node = (Get-Command node).Source
$handler = Join-Path $PSScriptRoot 'handler.cjs'
$command = "`"$node`" `"$handler`" `"$out`" `"%1`""

foreach ($hive in 'HKCU', 'HKLM') {
  $k = "${hive}:\Software\Classes\jbdebug$hive"
  New-Item -Path "$k\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path $k -Name '(Default)' -Value "URL:jbdebug$hive"
  Set-ItemProperty -Path $k -Name 'URL Protocol' -Value ''
  Set-ItemProperty -Path "$k\shell\open\command" -Name '(Default)' -Value $command
}

Write-Host "session: $((Get-Process -Id $PID).SessionId) interactive: $([Environment]::UserInteractive) user: $env:USERNAME"

function Try-Launch($label, $block) {
  $before = (Get-Process).Id
  try { & $block } catch { Write-Host "$label threw: $($_.Exception.Message)" }
  Start-Sleep -Seconds 5
  $new = Get-Process | Where-Object { $before -notcontains $_.Id } | ForEach-Object { $_.ProcessName }
  Write-Host "$label -> files: [$((Get-ChildItem $out -Name) -join ', ')] new processes: [$($new -join ', ')]"
}

Try-Launch 'Start-Process HKCU' { Start-Process 'jbdebughkcu://open?id=sp-hkcu' }
Try-Launch 'Start-Process HKLM' { Start-Process 'jbdebughklm://open?id=sp-hklm' }
Try-Launch 'cmd start HKCU' { cmd /c 'start "" "jbdebughkcu://open?id=cmd-hkcu"' }
Try-Launch 'explorer HKCU' { explorer.exe 'jbdebughkcu://open?id=explorer-hkcu' }
Try-Launch 'rundll32 HKLM' { rundll32.exe url.dll,FileProtocolHandler 'jbdebughklm://open?id=rundll-hklm' }
Try-Launch 'handler directly' { & $node $handler $out 'jbdebughkcu://open?id=direct' }
