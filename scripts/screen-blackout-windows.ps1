# $Action is supplied by the fixed Cortex adapter: status, on, or off.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
if ($Action -notin @('status', 'on', 'off')) { throw 'Invalid screen action' }
$root = Join-Path $env:LOCALAPPDATA 'ScreenBlackout'
$exe = Join-Path $root 'ScreenBlackout.exe'
function Read-Blackout {
    $state = Get-Content -LiteralPath (Join-Path $root 'status.json') -Raw | ConvertFrom-Json
    $helper = Get-Process -Id $state.pid -ErrorAction Stop
    if (-not $state.running -or $helper.Path -ne $exe -or $state.blackout -isnot [bool] -or $state.monitorCount -lt 1) {
        throw 'ScreenBlackout is not running; open it on laptop-w'
    }
    if ($state.blackout -and $state.coveredMonitors -ne $state.monitorCount) { throw 'ScreenBlackout did not cover every monitor' }
    return @{ state = $state; session = $helper.SessionId }
}
$current = Read-Blackout
if ($Action -ne 'status') {
    if ($current.session -ne (Get-Process -Id $PID).SessionId) { throw 'Screen commands require the active desktop session' }
    $desired = $Action -eq 'on'
    if ($current.state.blackout -ne $desired) {
        $argument = if ($desired) { '--toggle' } else { '--restore' }
        $command = Start-Process -FilePath $exe -ArgumentList $argument -PassThru
        if (-not $command.WaitForExit(2000)) { $command.Kill(); throw 'Screen command timed out; refresh before retrying' }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        $current = Read-Blackout
        if ($current.state.blackout -eq $desired) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($current.state.blackout -ne $desired) { throw 'ScreenBlackout did not confirm the requested state; refresh before retrying' }
}
@{ enabled = $current.state.blackout; monitorCount = $current.state.monitorCount } | ConvertTo-Json -Compress
} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
