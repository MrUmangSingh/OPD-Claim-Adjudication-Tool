# =============================================================================
# OPD Claim Adjudication Tool — Azure Container Apps deployment
#
# Prerequisites:
#   - az CLI logged in  (az login)
#   - No local Docker needed — image is built via ACR Tasks in the cloud
#
# Usage:
#   .\backend\deploy-azure.ps1
#   Reads ANTHROPIC_API_KEY, JWT_SECRET, and ALLOWED_ORIGINS from backend\.env
# =============================================================================
$ErrorActionPreference = "Continue"

# ── Load backend\.env ─────────────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir ".env"

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: $EnvFile not found. Copy .env.example to .env and fill in the values."
    exit 1
}

foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    $key, $value = $line -split '=', 2
    [System.Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), 'Process')
}

# ── Configurable defaults ─────────────────────────────────────────────────────
$ResourceGroup    = if ($env:RESOURCE_GROUP)    { $env:RESOURCE_GROUP }    else { "rg-opd-claim-tool" }
$Location         = if ($env:LOCATION)          { $env:LOCATION }          else { "eastus" }
$AcrName          = if ($env:ACR_NAME)          { $env:ACR_NAME }          else { "opdclaimtoolacr" }   # globally unique, a-z0-9 only
$StorageAccount   = if ($env:STORAGE_ACCOUNT)   { $env:STORAGE_ACCOUNT }   else { "opdclaimtoolsa" }    # globally unique, 3-24 lowercase alphanumeric
$EnvironmentName  = if ($env:ENVIRONMENT_NAME)  { $env:ENVIRONMENT_NAME }  else { "opd-claim-env" }
$AppName          = if ($env:APP_NAME)          { $env:APP_NAME }          else { "opd-claim-backend" }

# ── Validate required secrets ─────────────────────────────────────────────────
if (-not $env:ANTHROPIC_API_KEY) { Write-Error "ERROR: ANTHROPIC_API_KEY missing from .env"; exit 1 }
if (-not $env:JWT_SECRET)        { Write-Error "ERROR: JWT_SECRET missing from .env";        exit 1 }

$AnthropicApiKey = $env:ANTHROPIC_API_KEY
$JwtSecret       = $env:JWT_SECRET
$AllowedOrigins  = if ($env:ALLOWED_ORIGINS) { $env:ALLOWED_ORIGINS } else { "*" }

# ── Derived ───────────────────────────────────────────────────────────────────
$ImageTag = git -C $ScriptDir rev-parse --short HEAD 2>$null
if (-not $ImageTag) { $ImageTag = "latest" }
$AcrServer = "$AcrName.azurecr.io"
$ImageName = "$AcrServer/$AppName`:$ImageTag"

Write-Host "======================================================================"
Write-Host "  Deploying OPD Claim Adjudication Backend -> Azure Container Apps"
Write-Host "  Resource group : $ResourceGroup  ($Location)"
Write-Host "  Registry       : $AcrName"
Write-Host "  App            : $AppName"
Write-Host "  Image tag      : $ImageTag"
Write-Host "======================================================================"

# ── 1. Resource group ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/8] Resource group"
az group create --name $ResourceGroup --location $Location -o none
Write-Host "      v $ResourceGroup"

# ── 2. Azure Container Registry ───────────────────────────────────────────────
Write-Host ""
Write-Host "[2/8] Container Registry"
az acr create --resource-group $ResourceGroup --name $AcrName --sku Basic --admin-enabled true -o none 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "      (already exists)" }
Write-Host "      v $AcrServer"

# ── 3. Build + push via ACR Tasks (no local Docker required) ──────────────────
Write-Host ""
Write-Host "[3/8] Build & push image via ACR Tasks"
az acr build `
    --registry $AcrName `
    --image "$AppName`:$ImageTag" `
    --image "$AppName`:latest" `
    --file "$ScriptDir\Dockerfile" `
    $ScriptDir
Write-Host "      v $ImageName"

$AcrPassword = (az acr credential show --name $AcrName --query "passwords[0].value" -o tsv)

# ── 4. Storage account + file shares ─────────────────────────────────────────
Write-Host ""
Write-Host "[4/8] Storage account + file shares"
az storage account create `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2 `
    -o none 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "      (already exists)" }

$StorageKey = (az storage account keys list `
    --account-name $StorageAccount `
    --resource-group $ResourceGroup `
    --query "[0].value" -o tsv)

foreach ($share in @("db", "uploads")) {
    az storage share create `
        --name "opd-$share" `
        --account-name $StorageAccount `
        --account-key $StorageKey `
        --quota 5 `
        -o none 2>$null
}
Write-Host "      v $StorageAccount  (shares: opd-db, opd-uploads)"

# ── 5. Container Apps environment ─────────────────────────────────────────────
Write-Host ""
Write-Host "[5/8] Container Apps environment"
az containerapp env create `
    --name $EnvironmentName `
    --resource-group $ResourceGroup `
    --location $Location `
    -o none 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "      (already exists)" }
Write-Host "      v $EnvironmentName"

# ── 6. Link Azure File shares to environment ──────────────────────────────────
Write-Host ""
Write-Host "[6/8] Linking storage to environment"
foreach ($share in @("db", "uploads")) {
    az containerapp env storage set `
        --name $EnvironmentName `
        --resource-group $ResourceGroup `
        --storage-name "opd-$share" `
        --azure-file-account-name $StorageAccount `
        --azure-file-account-key $StorageKey `
        --azure-file-share-name "opd-$share" `
        --access-mode ReadWrite `
        -o none
}
Write-Host "      v opd-db -> /mnt/db   |   opd-uploads -> /mnt/uploads"

# ── 7. Generate container app YAML manifest ───────────────────────────────────
Write-Host ""
Write-Host "[7/8] Generating manifest"

$SubscriptionId = (az account show --query id -o tsv)
$EnvResourceId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.App/managedEnvironments/$EnvironmentName"
$YamlFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.yaml'

@"
location: $Location
properties:
  managedEnvironmentId: $EnvResourceId
  configuration:
    ingress:
      external: true
      targetPort: 8000
      transport: http
      allowInsecure: false
    registries:
      - server: $AcrServer
        username: $AcrName
        passwordSecretRef: acr-password
    secrets:
      - name: anthropic-api-key
        value: "$AnthropicApiKey"
      - name: jwt-secret
        value: "$JwtSecret"
      - name: acr-password
        value: "$AcrPassword"
  template:
    volumes:
      - name: db-vol
        storageType: AzureFile
        storageName: opd-db
      - name: uploads-vol
        storageType: AzureFile
        storageName: opd-uploads
    containers:
      - name: backend
        image: $ImageName
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - name: ANTHROPIC_API_KEY
            secretRef: anthropic-api-key
          - name: JWT_SECRET
            secretRef: jwt-secret
          - name: ALLOWED_ORIGINS
            value: "$AllowedOrigins"
        volumeMounts:
          - volumeName: db-vol
            mountPath: /mnt/db
          - volumeName: uploads-vol
            mountPath: /mnt/uploads
    scale:
      minReplicas: 1
      maxReplicas: 3
"@ | Set-Content -Path $YamlFile -Encoding UTF8
Write-Host "      v manifest written"

# ── 8. Create or update the container app ─────────────────────────────────────
Write-Host ""
Write-Host "[8/8] Deploying container app"
az containerapp show --name $AppName --resource-group $ResourceGroup -o none 2>$null
if ($LASTEXITCODE -eq 0) {
    az containerapp update --name $AppName --resource-group $ResourceGroup --yaml $YamlFile -o none
    Write-Host "      v Updated existing app"
} else {
    az containerapp create --name $AppName --resource-group $ResourceGroup --yaml $YamlFile -o none
    Write-Host "      v Created new app"
}

Remove-Item $YamlFile -Force

# ── Done ──────────────────────────────────────────────────────────────────────
$AppFqdn = (az containerapp show `
    --name $AppName `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" -o tsv)

Write-Host ""
Write-Host "======================================================================"
Write-Host "  DEPLOYMENT COMPLETE"
Write-Host ""
Write-Host "  Backend URL  : https://$AppFqdn"
Write-Host "  Health check : https://$AppFqdn/health"
Write-Host ""
Write-Host "  Tail live logs:"
Write-Host "    az containerapp logs show -n $AppName -g $ResourceGroup --follow"
Write-Host ""
Write-Host "  Redeploy after code changes:"
Write-Host "    .\backend\deploy-azure.ps1"
Write-Host ""
Write-Host "  Update ALLOWED_ORIGINS once your frontend is deployed:"
Write-Host "    az containerapp update -n $AppName -g $ResourceGroup ``"
Write-Host "      --set-env-vars ALLOWED_ORIGINS=https://your-frontend.vercel.app"
Write-Host "======================================================================"
