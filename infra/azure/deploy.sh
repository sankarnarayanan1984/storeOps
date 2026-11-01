#!/usr/bin/env bash
# Deploy StoreOps to Azure Container Apps.
#
# Prerequisites: Azure CLI (`az`) logged in (`az login`), a subscription where you can create
# resource groups and role assignments (Owner, or Contributor + User Access Administrator).
# No local Docker is needed: the image is built in Azure Container Registry.
#
# Usage:  infra/azure/deploy.sh
# Config (environment variables, all optional):
#   AZ_SUBSCRIPTION   subscription id or name   (default: current `az account`)
#   AZ_RESOURCE_GROUP resource group name       (default: rg-storeops)
#   AZ_LOCATION       Azure region              (default: eastus)
#   AZ_NAME_PREFIX    resource name prefix      (default: storeops)
#   IMAGE_TAG         image tag                 (default: git short sha, else timestamp)
set -euo pipefail

cd "$(dirname "$0")/../.."

RG="${AZ_RESOURCE_GROUP:-rg-storeops}"
LOCATION="${AZ_LOCATION:-eastus}"
PREFIX="${AZ_NAME_PREFIX:-storeops}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
TEMPLATE="infra/azure/main.bicep"

command -v az >/dev/null || { echo "Azure CLI not found: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2; exit 1; }
az account show >/dev/null 2>&1 || { echo "Not logged in. Run: az login" >&2; exit 1; }
[ -n "${AZ_SUBSCRIPTION:-}" ] && az account set --subscription "$AZ_SUBSCRIPTION"

echo "==> Subscription: $(az account show --query name -o tsv)"
echo "==> Resource group $RG in $LOCATION, image tag $TAG"

az provider register --namespace Microsoft.App --wait >/dev/null
az provider register --namespace Microsoft.OperationalInsights --wait >/dev/null
az provider register --namespace Microsoft.ContainerRegistry --wait >/dev/null
az group create --name "$RG" --location "$LOCATION" --output none

echo "==> Phase 1/3: registry, identity, logs, Container Apps environment"
ACR_NAME=$(az deployment group create \
  --resource-group "$RG" --name storeops-infra --template-file "$TEMPLATE" \
  --parameters namePrefix="$PREFIX" deployApp=false \
  --query properties.outputs.acrName.value -o tsv)

echo "==> Phase 2/3: building image in $ACR_NAME (az acr build)"
az acr build --registry "$ACR_NAME" --image "storeops-api:$TAG" --file Dockerfile . --output none

echo "==> Phase 3/3: container app"
APP_URL=$(az deployment group create \
  --resource-group "$RG" --name storeops-app --template-file "$TEMPLATE" \
  --parameters namePrefix="$PREFIX" deployApp=true imageTag="$TAG" \
  --query properties.outputs.appUrl.value -o tsv)

echo "==> Smoke test: $APP_URL/api/tasks"
for attempt in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$APP_URL/api/tasks" || true)
  [ "$code" = "200" ] && break
  sleep 10
done
echo "GET /api/tasks -> $code"

cat <<DONE

Deployed StoreOps
  URL:            $APP_URL
  UI:             $APP_URL/activities
  Image:          $ACR_NAME.azurecr.io/storeops-api:$TAG
  Resource group: $RG
Tear down with:   az group delete --name $RG --yes --no-wait
DONE
[ "$code" = "200" ]
