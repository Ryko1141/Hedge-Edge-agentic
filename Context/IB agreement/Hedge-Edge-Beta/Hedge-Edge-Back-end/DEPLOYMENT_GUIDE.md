# Hedge Edge License API - Deployment Guide

This guide covers deploying the License Validation API to production using Railway, Render, or Docker.

## Prerequisites

- Supabase project with the license tables (see migration file)
- Domain configured: `api.hedge-edge.com`
- SSL certificate (handled automatically by Railway/Render)

---

## 1. Database Setup (Supabase)

### Apply the Migration

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Open the migration file: `supabase/migrations/20260201000000_license_system.sql`
4. Execute the migration

Or use the Supabase CLI:

```bash
cd Hedge-Edge-Front-end
supabase db push
```

### Get Your Credentials

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_KEY` (⚠️ Keep this secret!)

---

## 2. Deploy to Railway (Recommended)

Railway provides automatic deployments from Git with usage-based pricing (~$0.50-2/mo for this workload). You get $5 free credit/month.

### Cost Protection (3-Layer)

1. **Railway Spending Cap**: Set to $5/month in Railway dashboard → Settings → Usage Limits
2. **Server Rate Limiting**: slowapi at 100 req/min per IP
3. **Daily Request Guard**: Server rejects requests after 10K/day (configurable via `MAX_DAILY_REQUESTS`)

### Steps

1. **Create Railway Account**: https://railway.app

2. **New Project** → **Deploy from GitHub**
   - Select your repository
   - Set root directory to: `Hedge-Edge-Back-end`

3. **Configure Environment Variables**:
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_SERVICE_KEY` = your service role key
   - `CREEM_API_KEY` = your Creem API key (⚠️ ONLY on the server, never in desktop builds)
   - `CREEM_WEBHOOK_SECRET` = your Creem webhook signing secret (optional but recommended)
   - `CREEM_API_MODE` = `production` (or `sandbox` for testing)
   - `LOG_LEVEL` = `INFO`
   - `RATE_LIMIT` = `100/minute`
   - `MAX_DAILY_REQUESTS` = `10000` (cost protection cap)

4. **Configure Domain**:
   - Go to **Settings** → **Networking**
   - Add custom domain: `api.hedge-edge.com`
   - Configure DNS CNAME to Railway's provided domain

5. **Set Spending Cap**:
   - Go to **Settings** → **Usage Limits**
   - Set maximum monthly spend to **$5**
   - This hard-caps your Railway bill

6. **Configure Creem Webhook** (in Creem dashboard):
   - URL: `https://api.hedge-edge.com/v1/webhooks/creem`
   - Events: `subscription.cancelled`, `subscription.expired`, `charge.refunded`, `subscription.renewed`
   - Set webhook secret → copy to `CREEM_WEBHOOK_SECRET` env var

5. **Deploy**: Railway auto-deploys on push to main branch

### Railway CLI Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd Hedge-Edge-Back-end
railway init

# Set environment variables
railway variables set SUPABASE_URL="https://xxx.supabase.co"
railway variables set SUPABASE_SERVICE_KEY="xxx"
railway variables set CREEM_API_KEY="xxx"
railway variables set CREEM_API_MODE="production"
railway variables set LOG_LEVEL="INFO"
railway variables set RATE_LIMIT="100/minute"
railway variables set MAX_DAILY_REQUESTS="10000"

# Deploy
railway up
```

---

## 3. Deploy to Render

Render provides easy Docker deployments with auto-scaling.

### Steps

1. **Create Render Account**: https://render.com

2. **New** → **Web Service** → **Connect Repository**

3. **Configure**:
   - Name: `hedge-edge-license-api`
   - Region: Oregon (or closest to users)
   - Branch: main
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.production.txt`
   - Start Command: `uvicorn license_api_production:app --host 0.0.0.0 --port $PORT --workers 1 --log-level info`

4. **Environment Variables** (add in dashboard):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `LOG_LEVEL`
   - `RATE_LIMIT`

5. **Custom Domain**:
   - Go to Settings → Custom Domains
   - Add `api.hedge-edge.com`
   - Configure DNS

---

## 4. Deploy with Docker

For self-hosted or other cloud providers.

### Build and Run

```bash
cd backend

# Build image
docker build -t hedge-edge-api:latest .

# Run container
docker run -d \
  --name hedge-edge-api \
  -p 8000:8000 \
  -e SUPABASE_URL="https://xxx.supabase.co" \
  -e SUPABASE_SERVICE_KEY="xxx" \
  -e LOG_LEVEL="INFO" \
  -e RATE_LIMIT="100/minute" \
  hedge-edge-api:latest
```

### Docker Compose

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - LOG_LEVEL=INFO
      - RATE_LIMIT=100/minute
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
```

---

## 5. DNS Configuration

Configure your domain's DNS to point to the deployment:

### For Railway
```
Type: CNAME
Name: api
Value: <your-railway-app>.up.railway.app
```

### For Render
```
Type: CNAME
Name: api
Value: <your-render-app>.onrender.com
```

### For Self-Hosted (with reverse proxy)
```
Type: A
Name: api
Value: <your-server-ip>
```

---

## 6. SSL/TLS Configuration

- **Railway/Render**: Automatic SSL with Let's Encrypt
- **Self-Hosted**: Use Nginx/Caddy with Let's Encrypt

### Nginx Example (Self-Hosted)

```nginx
server {
    listen 443 ssl http2;
    server_name api.hedge-edge.com;
    
    ssl_certificate /etc/letsencrypt/live/api.hedge-edge.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.hedge-edge.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 7. Monitoring & Logging

### View Logs

**Railway**:
```bash
railway logs
```

**Render**: View in dashboard under Logs tab

**Docker**:
```bash
docker logs -f hedge-edge-api
```

### Health Check Monitoring

Set up uptime monitoring with:
- UptimeRobot (free)
- Pingdom
- Better Uptime

Monitor endpoint: `https://api.hedge-edge.com/health`

---

## 8. Testing the Deployment

### Verify Health

```bash
curl https://api.hedge-edge.com/health
# {"status":"healthy","timestamp":"2026-02-01T12:00:00Z"}
```

### Test Validation

```bash
curl -X POST https://api.hedge-edge.com/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "YOUR-LICENSE-KEY-HERE",
    "deviceId": "your-device-id",
    "platform": "desktop"
  }'
```

### Check API Documentation

Visit: `https://api.hedge-edge.com/docs`

---

## 9. Troubleshooting

### Common Issues

**502 Bad Gateway**
- Check if the application is running
- Verify PORT environment variable is set
- Check logs for startup errors

**Database Connection Failed**
- Verify SUPABASE_URL is correct
- Verify SUPABASE_SERVICE_KEY is valid
- Check if Supabase project is accessible

**Rate Limit Errors**
- Implement client-side rate limiting
- Check if requests are being made too frequently
- Contact support to increase limits

**CORS Errors**
- Verify origin is in allowed list
- Check browser dev tools for specific CORS error
- Desktop apps use `app://` origin

---

## 10. Security Checklist

- [ ] SUPABASE_SERVICE_KEY is not committed to Git
- [ ] Environment variables are set in deployment platform, not in code
- [ ] SSL/TLS is enforced (no HTTP access)
- [ ] Rate limiting is enabled
- [ ] Logs are being captured and monitored
- [ ] Database RLS policies are active
- [ ] Regular backups are configured in Supabase

---

## Support

- **Issues**: Create GitHub issue
- **Email**: support@hedge-edge.com
- **Documentation**: https://docs.hedge-edge.com
