$now = Get-Date
$target = Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour 20 -Minute 0 -Second 0
if ($target -lt $now) { $target = $target.AddDays(1) }

$taskName = "Jarvis-TestInvoice"
$script = "C:\Users\mvp13\.openclaw\workspace\invoice\api\generate.js"
$action = "node `"$script`""

# Delete existing if any
schtasks /delete /tn $taskName /f 2>$null

$timeStr = $target.ToString("HH:mm")
$dateStr = $target.ToString("dd/MM/yyyy")

schtasks /create /tn $taskName /tr "$action" /sc once /st $timeStr /sd $dateStr /f

Write-Host "Scheduled: $taskName at $timeStr on $dateStr"
