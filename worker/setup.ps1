<#
PowerShell helper to set up and publish the Cloudflare Worker.
Run with: `powershell -ExecutionPolicy Bypass -File .\worker\setup.ps1`

It will:
- Ensure `wrangler` is installed (npm required).
- Run `wrangler login` (interactive).
- Create a KV namespace bound to `VISITS_KV`.
- Prompt you to paste the KV id (it will update `wrangler.toml`).
- Prompt to set `ADMIN_PASSWORD` via `wrangler secret put`.
- Publish the Worker with `wrangler publish`.

Notes:
- You must run this on your machine with Node/npm installed.
- `wrangler login` opens the browser for authentication.
#>

function Ensure-Command {
    param($cmd)
    $exists = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $exists) {
        return $false
    }
    return $true
}

Write-Host "Starting Cloudflare Worker setup..."

if (-not (Ensure-Command npm)) {
    Write-Host "Node/npm not found. Install Node.js before running this script." -ForegroundColor Red
    exit 1
}

if (-not (Ensure-Command wrangler)) {
    Write-Host "Installing wrangler globally via npm..."
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }
}

Write-Host "Logging into Cloudflare (interactive)..."
wrangler login
if ($LASTEXITCODE -ne 0) { Write-Host "wrangler login failed." -ForegroundColor Red; exit 1 }

$cwd = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $cwd
Set-Location ..\worker

Write-Host "Creating KV namespace 'VISITS_KV' and binding..."
wrangler kv:namespace create "VISITS_KV" --binding VISITS_KV
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create KV namespace. You can create it from dashboard manually." -ForegroundColor Yellow }

Write-Host "If the previous command printed an id (namespace id), paste it now. Otherwise press Enter to skip and bind via dashboard later."
$kvId = Read-Host "KV id (or blank)"
if ($kvId -ne "") {
    $toml = Get-Content wrangler.toml -Raw
    $new = $toml -replace 'REPLACE_WITH_KV_ID', $kvId
    $new | Set-Content wrangler.toml -Encoding UTF8
    Write-Host "wrangler.toml updated with KV id."
}

Write-Host "Now set admin password (you will be prompted). This is used to view /dashboard and /stats."
wrangler secret put ADMIN_PASSWORD
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to set secret." -ForegroundColor Yellow }

Write-Host "Publishing the Worker..."
wrangler publish
if ($LASTEXITCODE -ne 0) { Write-Host "Publish failed." -ForegroundColor Red; exit 1 }

Write-Host "Published. If successful, wrangler printed the workers.dev URL above. Copy it and update your website beacon endpoint if desired."
Write-Host "To update the endpoint automatically, enter the workers.dev hostname now (or press Enter to skip):"
$host = Read-Host "workers.dev host (e.g. abc123.account.workers.dev)"
if ($host -ne "") {
    $htmlPath = Join-Path -Path (Resolve-Path ..).Path -ChildPath 'abdallah_hameedat_cv.html'
    (Get-Content $htmlPath) -replace "https://ahameedatcv.pages.dev/collect", "https://$host/collect" | Set-Content $htmlPath -Encoding UTF8
    git add $htmlPath
    git commit -m "Set beacon to workers.dev endpoint"
    git push
    Write-Host "Updated abdallah_hameedat_cv.html and pushed to remote."
}

Write-Host "Done. Open the published URL /dashboard to log in with your ADMIN_PASSWORD and view stats."
