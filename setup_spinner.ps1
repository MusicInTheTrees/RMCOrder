param(
    [string]$Dir,
    [string]$Msg
)

# Run npm install as a hidden child process
$pInfo = New-Object System.Diagnostics.ProcessStartInfo
$pInfo.FileName        = "cmd.exe"
$pInfo.Arguments       = "/c npm install --prefer-offline"
$pInfo.WorkingDirectory = $Dir
$pInfo.UseShellExecute  = $false
$pInfo.CreateNoWindow   = $true

try {
    $p = [System.Diagnostics.Process]::Start($pInfo)
} catch {
    Write-Host "  ERROR: $Msg failed to start: $_"
    exit 1
}

$frames = @('|', '/', '-', '\')
$i      = 0
$secs   = 0

while (-not $p.HasExited) {
    $spin = $frames[$i % 4]
    Write-Host -NoNewline ("  " + $Msg + "  " + $spin + "  (" + $secs + "s)`r")
    Start-Sleep -Milliseconds 250
    $i++
    if ($i % 4 -eq 0) { $secs++ }
}

$p.WaitForExit()

if ($p.ExitCode -eq 0) {
    Write-Host ("  " + $Msg + "  done  (" + $secs + "s)     ")
} else {
    Write-Host ("  " + $Msg + "  FAILED                    ")
    exit 1
}
