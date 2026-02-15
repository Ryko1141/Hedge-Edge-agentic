# HedgeEdge Backend — Railway Setup Guide

> **Dev-friendly, step-by-step instructions** for deploying the license validation backend on Railway, connected to Creem (payments) and Supabase (database).

---

## Architecture Overview

```
┌──────────────────┐         ┌──────────────────────────┐        ┌─────────────┐
│  Desktop App     │  HTTPS  │  Railway Backend          │  HTTP  │  Creem API  │
│  (Electron)      │ ──────► │  license_api_production.py│ ──────►│  (Payments) │
│                  │         │                          │        └─────────────┘
│  NO secrets here │         │  Holds: CREEM_API_KEY    │
│  Only has the    │         │         SUPABASE_KEY     │        ┌─────────────┐
│  Railway URL     │         │         WEBHOOK_SECRET   │  SQL   │  Supabase   │
└──────────────────┘         │                          │ ──────►│  (Postgres) │
                             └──────────────────────────┘        └─────────────┘
```

**Key principle**: The desktop app NEVER holds payment API keys. All secrets live on the Railway server.

---

## Prerequisites Checklist

Before you begin, you need accounts and credentials from three services:

| Service | What You Need | Where to Get It |
|---------|--------------|-----------------|
| **Railway** | Account (free tier = $5/mo credit) | [railway.app](https://railway.app) |
| **Supabase** | Project URL + service_role key | Supabase Dashboard → Project Settings → API |
| **Creem** | API key + webhook secret | Creem Dashboard → Developer Settings |

---

## Part 1 — Supabase Setup

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a region close to your users (e.g., `us-east-1`)
3. Set a strong database password — you won't need it directly, but keep it safe

### 1.2 Get Your Credentials

Navigate to **Project Settings → API** and copy:

| Credential | Where It Goes | Notes |
|-----------|---------------|-------|
| **Project URL** | `SUPABASE_URL` env var on Railway | Looks like `https://xxxx.supabase.co` |
| **service_role key** | `SUPABASE_SERVICE_KEY` env var on Railway | ⚠️ This is a **secret** key — full DB access, never expose publicly |

> ⚠️ Do NOT use the `anon` key. The backend needs `service_role` to bypass Row Level Security.

### 1.3 Run the Database Migration

The license system requires 4 tables. You have two options:

**Option A — Supabase CLI (recommended)**
```bash
cd Hedge-Edge-Front-end
npx supabase db push
```

**Option B — SQL Editor (manual)**

1. Go to **Supabase Dashboard → SQL Editor**
2. Open and execute the migration file:
   `Hedge-Edge-Front-end/supabase/migrations/20260201000000_license_system.sql`

### 1.4 Verify Tables Were Created

After running the migration, check that these tables exist under **Table Editor**:

| Table | Purpose |
|-------|---------|
| `licenses` | License keys, plans, expiry dates, active status |
| `license_devices` | Which devices are registered to each license |
| `license_sessions` | Active session tokens (heartbeat tracking) |
| `license_validation_logs` | Audit log of every validation attempt |

#### Licenses Table Schema (Key Columns)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Auto-generated primary key |
| `license_key` | VARCHAR(64) | The license key string (UNIQUE) |
| `email` | VARCHAR(255) | Customer email |
| `plan` | VARCHAR(50) | `demo`, `professional`, or `enterprise` |
| `max_devices` | INTEGER | How many devices can use this license simultaneously |
| `features` | JSONB | Array of enabled features, e.g. `["trade-copying", "hedge-detection"]` |
| `is_active` | BOOLEAN | Whether the license is currently active |
| `expires_at` | TIMESTAMPTZ | When the license expires |

### 1.5 Insert a Test License (Optional)

To test without Creem, manually insert a license:

```sql
INSERT INTO licenses (license_key, email, plan, max_devices, expires_at)
VALUES (
  'TEST-KEY-12345678',
  'dev@hedgeedge.com',
  'professional',
  3,
  NOW() + INTERVAL '30 days'
);
```

---

## Part 2 — Creem Setup

Creem is the payment/subscription platform that issues license keys when customers purchase.

### 2.1 Get Your API Credentials

Navigate to the **Creem Developer Dashboard**:

| Credential | Where It Goes | How to Find |
|-----------|---------------|-------------|
| **API Key** | `CREEM_API_KEY` on Railway | Creem Dashboard → API Keys → Copy key |
| **Webhook Secret** | `CREEM_WEBHOOK_SECRET` on Railway | Creem Dashboard → Webhooks → Signing Secret |

> **Sandbox vs Production**: Creem provides a sandbox environment for testing:
> - Sandbox API: `https://test-api.creem.io`
> - Production API: `https://api.creem.io`
> - Set `CREEM_API_MODE=sandbox` for testing, `production` for live

### 2.2 Understand the Creem ↔ Backend Flow

```
Customer buys subscription on Creem
        │
        ▼
Creem issues a license key
        │
        ▼
Customer enters license key in HedgeEdge app
        │
        ▼
Desktop app sends key to Railway backend
        │
        ▼
Backend calls Creem API to verify:
  1. POST /v1/licenses/activate  → creates/finds instance
  2. POST /v1/licenses/validate  → confirms status is "active"
        │
        ▼
Backend checks Supabase for device limits, plan features
        │
        ▼
Backend returns token to desktop app
```

### 2.3 Configure Creem Webhook

When a customer cancels, refunds, or renews, Creem sends a webhook to your backend so you can update the license status immediately (instead of waiting for the next validation check).

**In the Creem Dashboard → Webhooks:**

1. **Webhook URL**: `https://<your-railway-domain>/v1/webhooks/creem`
   - Example: `https://hedgeedge-api.up.railway.app/v1/webhooks/creem`
   - Or with custom domain: `https://api.hedge-edge.com/v1/webhooks/creem`

2. **Events to subscribe to**:
   - ✅ `subscription.cancelled` — user cancelled
   - ✅ `subscription.expired` — subscription lapsed
   - ✅ `charge.refunded` — payment refunded
   - ✅ `subscription.renewed` — subscription renewed
   - ✅ `subscription.reactivated` — subscription reactivated
   - ✅ `charge.succeeded` — successful payment

3. **Webhook Secret**: Copy the signing secret → save it as `CREEM_WEBHOOK_SECRET` on Railway

> ⚠️ You must deploy the Railway backend first (Part 3) before Creem can reach the webhook URL. Come back and set the URL after deployment.

### 2.4 Creem API Endpoints Used by the Backend

Your backend calls these Creem endpoints — you don't need to configure them, but good to know:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/licenses/activate` | POST | Activate a license key (idempotent — returns existing instance if already active) |
| `/v1/licenses/validate` | POST | Confirm a specific license instance is still active |

Headers sent: `x-api-key: <CREEM_API_KEY>`, `Content-Type: application/json`

---

## Part 3 — Railway Deployment

### 3.1 Create Railway Project

1. Sign up at [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub Repo**
3. Connect your GitHub account and select the repository
4. **Important**: Set the **root directory** to `Hedge-Edge-Back-end`
   - Railway Settings → General → Root Directory → `Hedge-Edge-Back-end`

### 3.2 Configure Environment Variables

Go to your Railway service → **Variables** tab → Add these:

| Variable | Value | Required? |
|----------|-------|-----------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | ✅ Yes |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` (your service_role key) | ✅ Yes |
| `CREEM_API_KEY` | Your Creem API key | ✅ Yes |
| `CREEM_API_MODE` | `sandbox` (testing) or `production` (live) | ✅ Yes |
| `CREEM_WEBHOOK_SECRET` | Your Creem webhook signing secret | 🟡 Recommended |
| `LOG_LEVEL` | `INFO` | 🟢 Optional |
| `RATE_LIMIT` | `100/minute` | 🟢 Optional |
| `MAX_DAILY_REQUESTS` | `10000` | 🟢 Optional |
| `TOKEN_TTL_SECONDS` | `3600` | 🟢 Optional |

> **⚠️ Double-check**: No trailing spaces or newlines in your values. Railway can be sensitive to whitespace.

### 3.3 Deploy

Railway auto-deploys on every push to your main branch. For the first deploy:

1. Push your code to GitHub
2. Railway detects the Dockerfile and builds automatically
3. Watch the deploy logs for any errors

**CLI alternative:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
cd Hedge-Edge-Back-end
railway init
railway link

# Set all environment variables
railway variables set SUPABASE_URL="https://xxxx.supabase.co"
railway variables set SUPABASE_SERVICE_KEY="your-service-role-key"
railway variables set CREEM_API_KEY="your-creem-api-key"
railway variables set CREEM_API_MODE="production"
railway variables set CREEM_WEBHOOK_SECRET="your-webhook-secret"
railway variables set LOG_LEVEL="INFO"
railway variables set RATE_LIMIT="100/minute"
railway variables set MAX_DAILY_REQUESTS="10000"

# Deploy
railway up
```

### 3.4 Get Your Railway URL

After deployment:

1. Go to **Settings → Networking → Public Networking**
2. Click **Generate Domain** — you'll get something like `hedgeedge-api.up.railway.app`
3. (Optional) Add a custom domain: `api.hedge-edge.com` via CNAME record

**Save this URL** — you'll need it for the desktop app configuration (`HEDGE_EDGE_LICENSE_API_URL`).

### 3.5 Set Spending Cap ⚠️

**This is critical** — Railway uses usage-based pricing. Without a cap, a bug or DDoS could run up charges.

1. Go to **Railway Dashboard → Settings → Usage → Usage Limits**
2. Set maximum monthly spend to **$5**
3. Railway will stop your service if the cap is hit (better than a surprise bill)

> At <100 users, expected monthly cost is **$0.50–$2.00** — well within the $5 free credit.

### 3.6 Verify Deployment

Test that your backend is running:

```bash
# Health check
curl https://your-app.up.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-02-11T...",
#   "serverTime": 1739...,
#   "version": "1.1.0",
#   "dailyRequestsUsed": 1,
#   "dailyRequestsMax": 10000
# }
```

**API docs** are available at:
- Swagger UI: `https://your-app.up.railway.app/docs`
- ReDoc: `https://your-app.up.railway.app/redoc`

Test a license validation (replace with your test key):
```bash
curl -X POST https://your-app.up.railway.app/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "TEST-KEY-12345678",
    "device_id": "test-device-abc123def456",
    "platform": "desktop"
  }'
```

---

## Part 4 — Connect the Desktop App

### 4.1 Set the API URL

In the desktop app's `.env.desktop` file (at `Hedge-Edge-Front-end/electron/.env.desktop`):

```dotenv
# Point to your Railway backend
HEDGE_EDGE_LICENSE_API_URL=https://your-app.up.railway.app
```

That's the **only** license-related env var needed for production builds. The desktop app will:
- Send `POST /v1/license/validate` to this URL
- Send `POST /v1/license/deactivate` to this URL
- Never hold `CREEM_API_KEY` or `SUPABASE_SERVICE_KEY`

### 4.2 Dev Mode (Running from Source)

When running `npm run electron:dev`, the app is NOT packaged, so it automatically:
- Starts an embedded API server on `localhost:3002`
- Uses `localhost:3002` instead of the Railway URL
- Requires `CREEM_API_KEY` in `.env.desktop` for local testing

```dotenv
# Dev-only settings (in Hedge-Edge-Front-end/electron/.env.desktop)
CREEM_API_KEY=your-creem-api-key
CREEM_API_MODE=sandbox
```

> ⚠️ Never include `CREEM_API_KEY` in production/packaged builds.

---

## Part 5 — Cost Protection (3 Layers)

The backend has three layers of cost protection to prevent unexpected Railway charges:

| Layer | Mechanism | Where Configured |
|-------|-----------|-----------------|
| 1. **Railway Spending Cap** | Hard-caps your monthly bill | Railway Dashboard → Settings → Usage Limits → $5 |
| 2. **Rate Limiting** | 100 requests/minute per IP address | `RATE_LIMIT` env var (slowapi) |
| 3. **Daily Request Guard** | Rejects all requests after 10K/day | `MAX_DAILY_REQUESTS` env var (server-side counter, resets midnight UTC) |

If the daily guard trips, the server returns `503` with:
```json
{
  "valid": false,
  "message": "Daily request limit exceeded. Service will resume at midnight UTC.",
  "code": "ERROR_DAILY_LIMIT"
}
```

---

## Part 6 — API Endpoints Reference

### `GET /health`
Health check — no auth, no rate limit.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-11T12:00:00+00:00",
  "serverTime": 1739275200,
  "version": "1.1.0",
  "dailyRequestsUsed": 42,
  "dailyRequestsMax": 10000
}
```

### `POST /v1/license/validate`
Validate a license key and issue a session token.

**Request:**
```json
{
  "license_key": "ABCD-1234-EFGH-5678",
  "device_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "platform": "desktop",
  "instance_name": "MYPC-a1b2c3"
}
```

**Success (200):**
```json
{
  "valid": true,
  "token": "abc123...",
  "ttlSeconds": 3600,
  "plan": "professional",
  "tier": "professional",
  "expiresAt": "2026-03-11T00:00:00+00:00",
  "features": ["trade-copying", "hedge-detection"],
  "email": "user@example.com",
  "devicesUsed": 1,
  "maxDevices": 3,
  "serverTime": 1739275200
}
```

**Failure (401/403):**
```json
{
  "valid": false,
  "message": "Invalid license key",
  "code": "ERROR_INVALID_KEY",
  "serverTime": 1739275200
}
```

Error codes: `ERROR_MISSING_KEY`, `ERROR_MISSING_DEVICE`, `ERROR_INVALID_KEY`, `ERROR_INACTIVE`, `ERROR_EXPIRED`, `ERROR_DEVICE_LIMIT`, `ERROR_CREEM_REJECTED`

### `POST /v1/license/heartbeat`
Refresh a session token and report status.

**Request:**
```json
{
  "token": "abc123...",
  "deviceId": "a1b2c3...",
  "status": { "activeTrades": 5, "equity": 10250.50 }
}
```

### `POST /v1/license/deactivate`
Free up a device slot.

**Request:**
```json
{
  "license_key": "ABCD-1234-EFGH-5678",
  "device_id": "a1b2c3d4e5f6..."
}
```

### `POST /v1/webhooks/creem`
Receives Creem lifecycle events — called by Creem, not by the desktop app.

---

## Part 7 — Troubleshooting

### Backend won't start
- **Check logs**: Railway Dashboard → Deployments → View Logs
- **502 Bad Gateway**: Usually means the app crashed on boot. Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set correctly (no typos/trailing spaces)
- **Port issues**: Railway sets `PORT` automatically — the Dockerfile and `railway.toml` use `${PORT:-8000}`

### "CREEM_API_KEY not configured" warning in logs
- This means the `CREEM_API_KEY` env var is empty or missing on Railway
- The backend will still work but will **skip Creem validation** (Supabase-only mode)
- For production, always set this key

### "License key not found" on validation
- The license key must exist in the Supabase `licenses` table
- Creem issues keys via their platform — you need to sync them to Supabase
- For testing, insert a row manually (see Section 1.5)

### Webhook not firing
- Verify the webhook URL in Creem dashboard matches your Railway domain exactly
- Check that the endpoint is reachable: `curl -X POST https://your-app.up.railway.app/v1/webhooks/creem -d '{}'`
- If using `CREEM_WEBHOOK_SECRET`, ensure the secret matches between Creem dashboard and Railway env var

### Desktop app says "License server URL not configured"
- In production builds, `HEDGE_EDGE_LICENSE_API_URL` must be set at build time in `.env.desktop`
- In dev mode, the embedded server on `localhost:3002` is used automatically

### Daily request cap hit (503)
- Check `/health` endpoint — `dailyRequestsUsed` shows current count
- Increase `MAX_DAILY_REQUESTS` if legitimate traffic exceeds 10K/day
- Investigate if a client is making excessive requests (check logs for IP patterns)

---

## Quick Reference — All Environment Variables

### Railway Backend (server-side)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | ✅ | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | — | Supabase service_role secret key |
| `CREEM_API_KEY` | ✅ | — | Creem API key for payment validation |
| `CREEM_API_MODE` | ✅ | `production` | `sandbox` or `production` |
| `CREEM_WEBHOOK_SECRET` | 🟡 | — | HMAC-SHA256 secret for webhook verification |
| `RATE_LIMIT` | 🟢 | `100/minute` | Per-IP rate limit |
| `MAX_DAILY_REQUESTS` | 🟢 | `10000` | Global daily request cap |
| `TOKEN_TTL_SECONDS` | 🟢 | `3600` | Session token lifetime in seconds |
| `TOKEN_REFRESH_THRESHOLD` | 🟢 | `300` | Seconds before expiry to allow refresh |
| `LOG_LEVEL` | 🟢 | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

### Desktop App (client-side)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEDGE_EDGE_LICENSE_API_URL` | ✅ (prod) | — | Railway backend URL, e.g. `https://app.up.railway.app` |
| `CREEM_API_KEY` | Dev only | — | ⚠️ Only for local dev — NEVER in production builds |
| `CREEM_API_MODE` | Dev only | `production` | `sandbox` for testing |

---

## Summary — Setup Order

```
1. Supabase  →  Create project → Copy URL + service_role key → Run migration
2. Creem     →  Get API key → Note webhook secret
3. Railway   →  Deploy from GitHub → Set env vars → Get domain URL → Set spending cap
4. Creem     →  Set webhook URL to Railway domain
5. Desktop   →  Set HEDGE_EDGE_LICENSE_API_URL in .env.desktop
6. Test      →  curl /health → validate a test license → verify webhook
```
