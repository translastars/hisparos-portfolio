# Hisparos Jobs Scraper — Setup Scheduled Task
# Run this as Administrator

$ErrorActionPreference = "Stop"
$TaskName = "Hisparos Jobs Scraper"
$ScriptPath = "$env:USERPROFILE\.openclaw\workspace\hisparos_portfolio\scripts\run_scraper.bat"
$WorkDir = "$env:USERPROFILE\.openclaw\workspace\hisparos_portfolio"

Write-Host "Creating scheduled task '$TaskName'..." -ForegroundColor Cyan

$Action = New-ScheduledTaskAction -Execute $ScriptPath -WorkingDirectory $WorkDir
$Triggers = @(
    (New-ScheduledTaskTrigger -Daily -At 08:30),
    (New-ScheduledTaskTrigger -Daily -At 14:30),
    (New-ScheduledTaskTrigger -Daily -At 20:30)
)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Triggers -Settings $Settings -Principal $Principal -Description "Scrapes LinkedIn for legal/sworn translation jobs for Hisparos, syncs to Vercel"

Write-Host "`n✅ Task created! Verifying..." -ForegroundColor Green
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, Triggers
Write-Host "`n✅ Done! The scraper will run daily at 08:30, 14:30, and 20:30." -ForegroundColor Green
Write-Host "   Data synced to: https://hisparosportfolio.vercel.app" -ForegroundColor Green
