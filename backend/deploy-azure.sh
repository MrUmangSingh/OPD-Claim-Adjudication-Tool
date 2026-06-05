#!/usr/bin/env bash
# =============================================================================
# OPD Claim Adjudication Tool — Azure Container Apps deployment
#
# Prerequisites:
#   - az CLI logged in  (az login)
#   - No local Docker needed — image is built via ACR Tasks in the cloud
#
# Usage:
#   bash backend/deploy-azure.sh
#   Reads ANTHROPIC_API_KEY, JWT_SECRET, and ALLOWED_ORIGINS from backend/.env
# =============================================================================
set -euo pipefail

# ── Load backend/.env ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
else
  echo "ERROR: $ENV_FILE not found. Copy .env.example to .env and fill in the values."
  exit 1
fi

# ── Configurable defaults ─────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-opd-claim-tool}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-opdclaimtoolacr}"              # globally unique, a-z0-9 only
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-opdclaimtoolsa}" # globally unique, 3-24 lowercase alphanumeric
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-opd-claim-env}"
APP_NAME="${APP_NAME:-opd-claim-backend}"

# ── Validate required secrets from .env ───────────────────────────────────────
: "${ANTHROPIC_API_KEY:?ERROR: ANTHROPIC_API_KEY missing from .env}"
: "${JWT_SECRET:?ERROR: JWT_SECRET missing from .env}"

ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-*}"

# ── Derived ───────────────────────────────────────────────────────────────────
IMAGE_TAG="$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo latest)"
IMAGE_NAME="$ACR_NAME.azurecr.io/$APP_NAME:$IMAGE_TAG"

echo "======================================================================"
echo "  Deploying OPD Claim Adjudication Backend → Azure Container Apps"
echo "  Resource group : $RESOURCE_GROUP  ($LOCATION)"
echo "  Registry       : $ACR_NAME"
echo "  App            : $APP_NAME"
echo "  Image tag      : $IMAGE_TAG"
echo "======================================================================"

# ── 1. Resource group ─────────────────────────────────────────────────────────
echo ""
echo "[1/8] Resource group"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none
echo "      ✓ $RESOURCE_GROUP"

# ── 2. Azure Container Registry ───────────────────────────────────────────────
echo ""
echo "[2/8] Container Registry"
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  -o none 2>/dev/null || echo "      (already exists)"
echo "      ✓ $ACR_NAME.azurecr.io"

# ── 3. Build + push via ACR Tasks (no local Docker required) ──────────────────
echo ""
echo "[3/8] Build & push image via ACR Tasks"
az acr build \
  --registry "$ACR_NAME" \
  --image "$APP_NAME:$IMAGE_TAG" \
  --image "$APP_NAME:latest" \
  --file "$SCRIPT_DIR/Dockerfile" \
  "$SCRIPT_DIR"
echo "      ✓ $IMAGE_NAME"

ACR_SERVER="$ACR_NAME.azurecr.io"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── 4. Storage account + file shares for SQLite DB and uploads ────────────────
echo ""
echo "[4/8] Storage account + file shares"
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  -o none 2>/dev/null || echo "      (already exists)"

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv)

for share in db uploads; do
  az storage share create \
    --name "opd-$share" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --quota 5 \
    -o none 2>/dev/null || true
done
echo "      ✓ $STORAGE_ACCOUNT  (shares: opd-db, opd-uploads)"

# ── 5. Container Apps environment ─────────────────────────────────────────────
echo ""
echo "[5/8] Container Apps environment"
az containerapp env create \
  --name "$ENVIRONMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  -o none 2>/dev/null || echo "      (already exists)"
echo "      ✓ $ENVIRONMENT_NAME"

# ── 6. Attach Azure File shares to the environment ────────────────────────────
echo ""
echo "[6/8] Linking storage to environment"
for share in db uploads; do
  az containerapp env storage set \
    --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --storage-name "opd-$share" \
    --azure-file-account-name "$STORAGE_ACCOUNT" \
    --azure-file-account-key "$STORAGE_KEY" \
    --azure-file-share-name "opd-$share" \
    --access-mode ReadWrite \
    -o none
done
echo "      ✓ opd-db → /mnt/db   |   opd-uploads → /mnt/uploads"

# ── 7. Build container app YAML manifest ──────────────────────────────────────
echo ""
echo "[7/8] Generating manifest"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
ENV_RESOURCE_ID="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.App/managedEnvironments/$ENVIRONMENT_NAME"

YAML_FILE=$(mktemp --suffix=.yaml)
cat > "$YAML_FILE" <<YAML
location: $LOCATION
properties:
  managedEnvironmentId: $ENV_RESOURCE_ID
  configuration:
    ingress:
      external: true
      targetPort: 8000
      transport: http
      allowInsecure: false
    registries:
      - server: $ACR_SERVER
        username: $ACR_NAME
        passwordSecretRef: acr-password
    secrets:
      - name: anthropic-api-key
        value: "$ANTHROPIC_API_KEY"
      - name: jwt-secret
        value: "$JWT_SECRET"
      - name: acr-password
        value: "$ACR_PASSWORD"
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
        image: $IMAGE_NAME
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - name: ANTHROPIC_API_KEY
            secretRef: anthropic-api-key
          - name: JWT_SECRET
            secretRef: jwt-secret
          - name: ALLOWED_ORIGINS
            value: "$ALLOWED_ORIGINS"
        volumeMounts:
          - volumeName: db-vol
            mountPath: /mnt/db
          - volumeName: uploads-vol
            mountPath: /mnt/uploads
    scale:
      minReplicas: 1
      maxReplicas: 3
YAML
echo "      ✓ manifest written"

# ── 8. Create or update the container app ─────────────────────────────────────
echo ""
echo "[8/8] Deploying container app"
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" -o none 2>/dev/null; then
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --yaml "$YAML_FILE" \
    -o none
  echo "      ✓ Updated existing app"
else
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --yaml "$YAML_FILE" \
    -o none
  echo "      ✓ Created new app"
fi

rm -f "$YAML_FILE"

# ── Done ──────────────────────────────────────────────────────────────────────
APP_FQDN=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo "======================================================================"
echo "  DEPLOYMENT COMPLETE"
echo ""
echo "  Backend URL  : https://$APP_FQDN"
echo "  Health check : https://$APP_FQDN/health"
echo ""
echo "  Tail live logs:"
echo "    az containerapp logs show -n $APP_NAME -g $RESOURCE_GROUP --follow"
echo ""
echo "  Redeploy after code changes (same secrets already stored):"
echo "    bash backend/deploy-azure.sh"
echo ""
echo "  Update ALLOWED_ORIGINS once your frontend is deployed:"
echo "    az containerapp update \\"
echo "      -n $APP_NAME -g $RESOURCE_GROUP \\"
echo "      --set-env-vars ALLOWED_ORIGINS=https://your-frontend.vercel.app"
echo "======================================================================"
