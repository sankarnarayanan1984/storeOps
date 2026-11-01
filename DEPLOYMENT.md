# Deployment

StoreOps ships as one container image and can be run two ways. Both are ready to use. The **local Docker** target was run on 2026-11-01 after the demonstration run; evidence is in §4. Azure Container Apps was not deployed.

| Target | Brief §3.4 | How | Needs |
|---|---|---|---|
| **Local Docker** | minimum | `docker compose up --build -d` | Docker Desktop / Engine with Compose v2 |
| **Azure Container Apps** | recommended (cloud) | `npm run deploy:azure` or the `deploy-azure` GitHub workflow | Azure CLI + subscription; **no local Docker** (image is built in Azure) |

---

## 1. The image
| File | What it does |
|---|---|
| `Dockerfile` | Two stages on `node:20-alpine`. **build:** `npm ci` from the lockfile, `tsc -p tsconfig.build.json` → `dist/`. **runtime:** `npm ci --omit=dev` (only `express`, `zod`), copies `dist/` and `public/`, runs as the non-root `node` user, `EXPOSE 3000`, `HEALTHCHECK` on `GET /api/tasks`. |
| `.dockerignore` | Build context is only `package*.json`, `tsconfig*.json`, `src/`, `public/` — tests, docs, harness files and `node_modules` stay out. |
| `docker-compose.yml` | Builds/tags `storeops-api:local`, maps `3000:3000`, sets `NODE_ENV=production`, restarts unless stopped. |

**Configuration:** `PORT` (default `3000`), `NODE_ENV`. **Secrets:** none — storage is in-memory and the seeded staff passwords are stored only as scrypt hashes. The demo password (`StoreOps@123`) is public by design; this is a capstone reference build, not for production.

---

## 2. Local Docker
```bash
docker compose up --build -d          # or: npm run docker:up
docker compose ps                     # wait for STATUS "healthy" (~10 s)
curl -i http://localhost:3000/api/tasks              # brief §2.3 smoke check → 200 OK
open http://localhost:3000/activities                # UI
docker compose logs -f storeops                      # "StoreOps API listening on http://localhost:3000"
docker compose down                   # or: npm run docker:down
```
Without Compose: `docker build -t storeops-api:local . && docker run --rm -p 3000:3000 storeops-api:local`.

---

## 3. Azure Container Apps

### Architecture (`infra/azure/main.bicep`)
```
Resource group (rg-storeops)
 ├─ Container Registry (Basic, admin user disabled)  ◄── az acr build (image built in Azure)
 ├─ User-assigned managed identity ── AcrPull role on the registry
 ├─ Log Analytics workspace ◄── container stdout/stderr
 ├─ Container Apps environment
 └─ Container App "storeops-api"
      ingress: external HTTPS → port 3000
      image: <registry>.azurecr.io/storeops-api:<git sha>, pulled with the managed identity
      probes: liveness + readiness on GET /api/tasks
      scale: min 1 / max 1 replica
```

### Decisions
| Decision | Why |
|---|---|
| Container Apps rather than App Service | Runs the same image as local Docker unchanged; HTTPS ingress, probes and log streaming built in; billed per use. |
| Image built with `az acr build` | No Docker needed on the deploying machine or CI runner; the build happens next to the registry. |
| Managed identity for image pulls; ACR admin user off | No registry passwords exist anywhere — nothing to store in GitHub or rotate. |
| GitHub OIDC (`azure/login`) in the workflow | No long-lived Azure credentials in repository secrets, only ids. |
| **Exactly one replica** | All state (activities, programmes, sessions) is in memory. A second replica would show different data and reject tokens issued by the first. Scaling out needs an external store first. |
| `npm run check` before deploying (workflow) | The deploy pipeline can't ship a build that would fail the merge gate. |

### Prerequisites
- Azure CLI ≥ 2.53 with Bicep (`az bicep install`), logged in: `az login`
- Rights to create a resource group **and role assignments** (Owner, or Contributor + User Access Administrator) — the template grants AcrPull to the managed identity.

### Deploy from a terminal
```bash
az login
# optional overrides: AZ_SUBSCRIPTION, AZ_RESOURCE_GROUP (rg-storeops), AZ_LOCATION (eastus), AZ_NAME_PREFIX (storeops), IMAGE_TAG
AZ_LOCATION=eastus npm run deploy:azure
```
`infra/azure/deploy.sh` then:
1. registers the `Microsoft.App`, `Microsoft.OperationalInsights` and `Microsoft.ContainerRegistry` providers and creates the resource group;
2. deploys `main.bicep` with `deployApp=false` → registry, identity + AcrPull, Log Analytics, environment;
3. runs `az acr build` → `storeops-api:<git short sha>`;
4. deploys `main.bicep` with `deployApp=true imageTag=<sha>` → the container app;
5. polls `GET <url>/api/tasks` until 200 and prints the URL.

### Deploy from GitHub Actions
`.github/workflows/deploy-azure.yml` (manual, *Run workflow*): runs `npm ci` + `npm run check`, logs in with OIDC and runs the same script. Set repository secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` for an app registration with a federated credential for this repository, and create a GitHub environment named `azure` (add required reviewers there to gate production-like deploys).

### Verify
```bash
URL=https://<printed fqdn>
curl -i $URL/api/tasks
TOKEN=$(curl -s -X POST $URL/api/staff/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya.nair@storeops.example","password":"StoreOps@123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token.token')
curl -s $URL/api/programmes -H "Authorization: Bearer $TOKEN"
# Logs:
az containerapp logs show -g rg-storeops -n storeops-api --follow
```

### If something fails
| Symptom | Fix |
|---|---|
| `az acr build` → `TasksOperationsNotAllowed` (some free/trial subscriptions) | Build where Docker exists and push: `az acr login -n <acr>` then `docker build -t <acr>.azurecr.io/storeops-api:<tag> . && docker push …`, then rerun phase 3: `az deployment group create -g rg-storeops -f infra/azure/main.bicep -p deployApp=true imageTag=<tag>` |
| Role assignment `AuthorizationFailed` | Your account lacks role-assignment rights — ask for User Access Administrator on the resource group, or have an Owner run phase 1. |
| Revision stuck "Activating" / image pull errors | Check `az containerapp revision list -g rg-storeops -n storeops-api -o table`; the AcrPull assignment can take a few minutes to propagate — rerun phase 3. |
| Container restarts | `az containerapp logs show … --type system`; the liveness probe expects 200 from `/api/tasks` on port 3000. |

### Tear down
```bash
az group delete --name rg-storeops --yes --no-wait
```

---

## 4. Evidence
| Item | Value |
|---|---|
| Target used | Local Docker (Docker 29.9.2, Compose v5.6.1, macOS arm64) via `docker compose up --build -d` |
| Code deployed | Baseline `18650cc` + the generator output of run `2026-10-30-bulk-status` (working tree, committed together with this file) |
| URL | `http://localhost:3000` (local only) |
| Container healthy | `storeops-api` — `Up (healthy)`, `0.0.0.0:3000->3000/tcp` → [screenshots/01-compose-ps.png](screenshots/01-compose-ps.png) |
| Base endpoint | `GET /api/tasks` → `HTTP/1.1 200 OK`, 8 seeded activities → [screenshots/02-get-tasks.png](screenshots/02-get-tasks.png) |
| Harness-generated feature | `PATCH /api/activities/bulk-status` → `HTTP/1.1 200 OK` → [screenshots/03-bulk-status.png](screenshots/03-bulk-status.png) |

**Feature call** (after `docker compose restart` to reset in-memory data; signed in as Priya, `stf_001`, STORE_MANAGER store_001, via `POST /api/staff/auth/login`):
```bash
curl -i -X PATCH http://localhost:3000/api/activities/bulk-status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"ids":["tsk_001","tsk_002","tsk_999"],"status":"DONE","note":"End of morning shift"}'
```
```json
{"batchId":"hnd_…","status":"DONE",
 "results":[{"id":"tsk_001","outcome":"UPDATED","from":"TODO","to":"DONE"},
            {"id":"tsk_002","outcome":"UPDATED","from":"IN_PROGRESS","to":"DONE"},
            {"id":"tsk_999","outcome":"FAILED","error":{"code":"NOT_FOUND","message":"Activity 'tsk_999' not found"}}],
 "summary":{"updated":2,"failed":1}}
```
This shows the sprint 1 contract behaviour in the running container: per-id results with partial failure (S1 ACs), and a 200 for a mixed batch. `GET /api/activities/tsk_001/audit` then returns the audit entry (actor "Priya Nair", note "End of morning shift", same `batchId`).

**Issue hit:** the first `docker compose up` failed with `bind: address already in use` on port 3000 because the local `npm run dev` server was still running (visible in screenshot 01). Stopping it and re-running `up` fixed it.
