"""
Hedge Edge License Validation API - Production Server
======================================================

A FastAPI-based license validation service for MT4/MT5/cTrader agents.
Deployed on Railway at: api.hedge-edge.com

Architecture:
  [Desktop App] --> [This Server (Railway)] --> [Creem API + Supabase]
  - Creem API: Source of truth for payment/subscription status
  - Supabase: Business logic (devices, sessions, features, logs)
  - Desktop app NEVER talks to Creem directly (secrets stay server-side)

Features:
- License key validation with Creem API cross-check
- Device tracking and limits via Supabase
- Session token management with heartbeat
- Creem webhook receiver for subscription lifecycle events
- Rate limiting (100 req/min per IP) + daily request cap (cost protection)
- Server timestamp for client-side clock-drift detection
- Comprehensive logging and monitoring

Endpoints:
- POST /v1/license/validate - Validate license key and issue session token
- POST /v1/license/heartbeat - Refresh session token and report status
- POST /v1/license/deactivate - Deactivate device to free up slot
- POST /v1/webhooks/creem - Creem subscription lifecycle webhooks
- GET /health - Health check endpoint
- GET /v1/license/status - Server status and statistics

Cost Control (Railway usage-based pricing):
- Single Uvicorn worker (~60MB RAM)
- Daily request guard (10K/day cap)
- Set Railway spending cap to $5/mo in dashboard
"""

import os
import logging
import secrets
import hashlib
import hmac
import asyncio
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

import httpx
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from supabase import create_client, Client
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware

# Load environment variables
load_dotenv()

# ============================================================================
# Configuration
# ============================================================================

class Config:
    """Application configuration"""
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    # Creem API (payment/subscription source of truth)
    CREEM_API_KEY: str = os.getenv("CREEM_API_KEY", "")
    CREEM_API_MODE: str = os.getenv("CREEM_API_MODE", "production")
    CREEM_WEBHOOK_SECRET: str = os.getenv("CREEM_WEBHOOK_SECRET", "")
    
    @property
    def CREEM_API_BASE(self) -> str:
        return "https://test-api.creem.io" if self.CREEM_API_MODE == "sandbox" else "https://api.creem.io"
    
    # Rate limiting
    RATE_LIMIT: str = os.getenv("RATE_LIMIT", "100/minute")
    
    # Cost protection: max requests per day to prevent Railway bill spikes
    MAX_DAILY_REQUESTS: int = int(os.getenv("MAX_DAILY_REQUESTS", "10000"))
    
    # Token settings
    TOKEN_TTL_SECONDS: int = int(os.getenv("TOKEN_TTL_SECONDS", "3600"))
    TOKEN_REFRESH_THRESHOLD: int = int(os.getenv("TOKEN_REFRESH_THRESHOLD", "300"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # API settings
    API_VERSION: str = "1.1.0"
    API_TITLE: str = "Hedge Edge License API"

config = Config()

# ============================================================================
# Startup Environment Validation
# ============================================================================

REQUIRED_ENV_VARS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "CREEM_API_KEY",
    "CREEM_WEBHOOK_SECRET",
]

def validate_environment():
    missing = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

validate_environment()

# ============================================================================
# Sentry Error Monitoring
# ============================================================================

SENTRY_DSN = os.getenv("SENTRY_DSN", "")

if SENTRY_DSN:
    def _filter_sentry_event(event, hint):
        """Remove sensitive data from Sentry events."""
        extra = event.get("extra", {})
        for key in list(extra.keys()):
            if any(s in key.lower() for s in ["password", "token", "key", "secret"]):
                extra[key] = "[REDACTED]"
        return event

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.getenv("ENVIRONMENT", "production"),
        traces_sample_rate=0.1,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
        ],
        before_send=_filter_sentry_event,
    )

# ============================================================================
# Logging Setup
# ============================================================================

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("license_api")

# ============================================================================
# Rate Limiter Setup
# ============================================================================

limiter = Limiter(key_func=get_remote_address)

# ============================================================================
# Supabase Client
# ============================================================================

supabase: Optional[Client] = None

def get_supabase() -> Client:
    """Get Supabase client, initializing if needed"""
    global supabase
    if supabase is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
            raise HTTPException(
                status_code=500,
                detail="Database configuration missing"
            )
        supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    return supabase

# ============================================================================
# Pydantic Models
# ============================================================================

class ValidateRequest(BaseModel):
    """License validation request body - accepts both field naming conventions"""
    licenseKey: Optional[str] = Field(default=None, min_length=8, max_length=64, description="License key to validate")
    license_key: Optional[str] = Field(default=None, min_length=8, max_length=64, description="License key (snake_case alias)")
    deviceId: Optional[str] = Field(default=None, min_length=8, max_length=255, description="Unique device identifier")
    device_id: Optional[str] = Field(default=None, min_length=8, max_length=255, description="Device ID (snake_case alias)")
    platform: str = Field(default="unknown", description="Platform type")
    accountId: Optional[str] = Field(default=None, max_length=100, description="Broker account ID")
    broker: Optional[str] = Field(default=None, max_length=100, description="Broker name")
    version: Optional[str] = Field(default="0.0.0", max_length=20, description="Agent version")
    instance_name: Optional[str] = Field(default=None, max_length=255, description="Instance name for Creem")
    
    @property
    def effective_license_key(self) -> str:
        key = self.licenseKey or self.license_key or ""
        return key.upper().strip()
    
    @property
    def effective_device_id(self) -> str:
        return self.deviceId or self.device_id or "unknown"
    
    @field_validator('platform')
    @classmethod
    def validate_platform(cls, v: str) -> str:
        allowed = ['mt4', 'mt5', 'ctrader', 'desktop', 'unknown']
        return v.lower() if v.lower() in allowed else 'unknown'


class ValidateSuccessResponse(BaseModel):
    """Successful validation response"""
    valid: bool = True
    token: str = Field(..., description="Session token (64 chars)")
    ttlSeconds: int = Field(..., description="Token time-to-live in seconds")
    plan: str = Field(..., description="License plan type")
    features: List[str] = Field(..., description="Enabled features")
    expiresAt: str = Field(..., description="License expiration date (ISO format)")
    email: Optional[str] = None
    devicesUsed: int = Field(default=1, description="Number of active devices")
    maxDevices: int = Field(default=1, description="Maximum allowed devices")


class ValidateErrorResponse(BaseModel):
    """Failed validation response"""
    valid: bool = False
    message: str = Field(..., description="Error description")
    code: str = Field(..., description="Error code")


class HeartbeatRequest(BaseModel):
    """Heartbeat request body"""
    token: str = Field(..., min_length=64, max_length=64, description="Current session token")
    deviceId: str = Field(..., min_length=8, max_length=255, description="Device identifier")
    status: Optional[dict] = Field(default=None, description="Optional status data")


class HeartbeatResponse(BaseModel):
    """Heartbeat response"""
    valid: bool = True
    newToken: Optional[str] = Field(default=None, description="Refreshed token if near expiry")
    ttlSeconds: int = Field(..., description="Remaining or new TTL")


class DeactivateRequest(BaseModel):
    """Device deactivation request - accepts both camelCase and snake_case"""
    licenseKey: Optional[str] = Field(None, min_length=8, max_length=64)
    license_key: Optional[str] = Field(None, min_length=8, max_length=64)
    deviceId: Optional[str] = Field(None, min_length=8, max_length=255)
    device_id: Optional[str] = Field(None, min_length=8, max_length=255)

    @property
    def effective_license_key(self) -> str:
        key = self.license_key or self.licenseKey or ""
        return key.upper().strip()

    @property
    def effective_device_id(self) -> str:
        return self.device_id or self.deviceId or ""


class DeactivateResponse(BaseModel):
    """Deactivation response"""
    success: bool = True
    devicesRemaining: int = Field(..., description="Number of devices still registered")


class StatusResponse(BaseModel):
    """Server status response"""
    status: str = "online"
    timestamp: str
    version: str
    activeLicenses: int = 0
    totalDevices: int = 0


# ============================================================================
# Helper Functions
# ============================================================================

def generate_token(license_key: str, device_id: str) -> str:
    """Generate a secure session token"""
    random_bytes = secrets.token_bytes(32)
    payload = f"{license_key}:{device_id}:{datetime.now(timezone.utc).isoformat()}".encode()
    combined = random_bytes + payload
    return hashlib.sha256(combined).hexdigest()


# ============================================================================
# Daily Request Guard (Cost Protection for Railway)
# ============================================================================

class DailyRequestGuard:
    """
    Kill-switch: reject all requests after daily cap to prevent Railway cost overrun.
    
    At 100 users × ~10 requests/day = 1,000. Cap at 10K = 10x headroom.
    If this trips, something is wrong (DDoS, client bug, infinite loop).
    Service auto-resets at midnight UTC.
    """
    def __init__(self, max_daily: int = 10_000):
        self.max_daily = max_daily
        self.count = 0
        self.reset_date = datetime.now(timezone.utc).date()
        self.lock = threading.Lock()
    
    def check(self) -> bool:
        with self.lock:
            today = datetime.now(timezone.utc).date()
            if today != self.reset_date:
                self.count = 0
                self.reset_date = today
            self.count += 1
            return self.count <= self.max_daily
    
    def get_count(self) -> int:
        return self.count

daily_guard = DailyRequestGuard(max_daily=config.MAX_DAILY_REQUESTS)


# ============================================================================
# Creem API Client (Payment Source of Truth)
# ============================================================================

async def validate_license_with_creem(license_key: str, instance_name: Optional[str] = None) -> dict:
    """
    Validate a license key against Creem API.
    
    Creem is the payment platform — it knows if the subscription is active,
    cancelled, refunded, etc. We check Creem on every validation to ensure
    the user still has a valid, paid subscription.
    
    Returns dict with: valid (bool), status (str), expires_at (str|None), error (str|None)
    """
    if not config.CREEM_API_KEY:
        logger.warning("CREEM_API_KEY not configured — skipping Creem validation")
        return {"valid": True, "status": "unchecked", "error": None}
    
    headers = {
        "Content-Type": "application/json",
        "x-api-key": config.CREEM_API_KEY,
        "User-Agent": f"HedgeEdge-API/{config.API_VERSION}",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Step 1: Try to activate (idempotent — returns existing instance if already active)
            activate_url = f"{config.CREEM_API_BASE}/v1/licenses/activate"
            activate_payload = {
                "key": license_key.upper().strip(),
                "instance_name": instance_name or f"HedgeEdge-server-check",
            }
            
            activate_resp = await client.post(activate_url, json=activate_payload, headers=headers)
            activate_data = activate_resp.json()
            
            logger.info(f"Creem activate response: {activate_resp.status_code}")
            
            # Extract instance_id for validation step
            instance_id = None
            if activate_resp.is_success and activate_data.get("instance"):
                inst = activate_data["instance"]
                if isinstance(inst, list) and len(inst) > 0:
                    instance_id = inst[-1].get("id")
                elif isinstance(inst, dict):
                    instance_id = inst.get("id")
            
            # If activation limit reached (403), the key is already fully activated — that's OK
            if activate_resp.status_code == 403:
                # Key exists but all slots used — still valid, just can't add more instances
                logger.info("Creem: activation limit reached (key is valid, slots full)")
                return {"valid": True, "status": "active", "error": None}
            
            if not activate_resp.is_success and activate_resp.status_code != 403:
                error_msg = activate_data.get("message", "Creem validation failed")
                if isinstance(error_msg, list):
                    error_msg = ", ".join(error_msg)
                logger.warning(f"Creem activation failed: {error_msg}")
                return {"valid": False, "status": "invalid", "error": error_msg}
            
            # Step 2: Validate with instance_id if available
            if instance_id:
                validate_url = f"{config.CREEM_API_BASE}/v1/licenses/validate"
                validate_payload = {
                    "key": license_key.upper().strip(),
                    "instance_id": instance_id,
                }
                
                validate_resp = await client.post(validate_url, json=validate_payload, headers=headers)
                validate_data = validate_resp.json()
                
                if validate_resp.is_success:
                    is_active = validate_data.get("status") == "active"
                    return {
                        "valid": is_active,
                        "status": validate_data.get("status", "unknown"),
                        "expires_at": validate_data.get("expires_at"),
                        "error": None if is_active else f"License status: {validate_data.get('status')}",
                    }
            
            # If activate succeeded, trust that status
            if activate_resp.is_success:
                status = activate_data.get("status", "active")
                return {
                    "valid": status == "active",
                    "status": status,
                    "expires_at": activate_data.get("expires_at"),
                    "error": None,
                }
            
            return {"valid": False, "status": "error", "error": "Could not validate with Creem"}
            
    except httpx.TimeoutException:
        logger.error("Creem API timeout — failing closed for security")
        return {"valid": False, "status": "timeout", "error": "Payment verification temporarily unavailable. Please try again.", "retry_after": 30}
    except Exception as e:
        logger.error(f"Creem API error: {e}")
        return {"valid": False, "status": "error", "error": "Payment verification temporarily unavailable. Please try again.", "retry_after": 30}


def verify_creem_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Creem webhook signature using HMAC-SHA256"""
    if not config.CREEM_WEBHOOK_SECRET:
        logger.warning("CREEM_WEBHOOK_SECRET not configured — cannot verify webhook")
        return False
    expected = hmac.new(
        config.CREEM_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


TRUSTED_PROXIES = [p.strip() for p in os.getenv("TRUSTED_PROXIES", "").split(",") if p.strip()]

def get_client_ip(request: Request) -> str:
    """Get client IP, only trusting X-Forwarded-For from known proxies."""
    client_ip = request.client.host if request.client else "unknown"
    
    if client_ip in TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            # Take the rightmost non-trusted IP
            ips = [ip.strip() for ip in forwarded.split(",")]
            for ip in reversed(ips):
                if ip not in TRUSTED_PROXIES:
                    return ip
    return client_ip


def hash_ip(ip: str) -> str:
    """One-way hash IP for privacy (GDPR). Preserves uniqueness for rate limiting."""
    salt = os.getenv("IP_HASH_SALT")
    if not salt:
        logger.warning("IP_HASH_SALT not set — generating random salt (will not persist across restarts)")
        salt = os.urandom(16).hex()
        os.environ["IP_HASH_SALT"] = salt  # Cache for this process lifetime
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:16]


async def log_validation_attempt(
    db: Client,
    license_key: str,
    device_id: str,
    platform: str,
    ip_address: str,
    success: bool,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    request_data: Optional[dict] = None
):
    """Log a validation attempt to the database"""
    try:
        db.table("license_validation_logs").insert({
            "license_key": license_key[:20] + "..." if len(license_key) > 20 else license_key,
            "device_id": device_id[:50] + "..." if len(device_id) > 50 else device_id,
            "platform": platform,
            "ip_address": ip_address,
            "success": success,
            "error_code": error_code,
            "error_message": error_message,
            "request_data": request_data
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log validation attempt: {e}")


# ============================================================================
# Application Lifecycle
# ============================================================================

async def cleanup_expired_sessions():
    """Periodically purge expired license sessions."""
    while True:
        try:
            await asyncio.sleep(3600)  # every hour
            db = get_supabase()
            db.table("license_sessions").delete().lt("expires_at", datetime.now(timezone.utc).isoformat()).execute()
            logger.info("Cleaned up expired sessions")
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown"""
    logger.info(f"Starting {config.API_TITLE} v{config.API_VERSION}")
    logger.info(f"Rate limit: {config.RATE_LIMIT}")
    
    # Validate required configuration
    if not config.CREEM_WEBHOOK_SECRET:
        raise RuntimeError("CREEM_WEBHOOK_SECRET is required. Set it in environment variables.")
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")
    
    logger.info("Supabase connection configured")
    
    # Start session cleanup background task
    task = asyncio.create_task(cleanup_expired_sessions())
    
    yield
    
    task.cancel()
    logger.info("Shutting down License API")


# ============================================================================
# FastAPI Application
# ============================================================================

_is_dev = os.getenv("ENVIRONMENT", "production") == "development"

app = FastAPI(
    title=config.API_TITLE,
    description="License validation API for Hedge Edge trading agents",
    version=config.API_VERSION,
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
    lifespan=lifespan
)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
_cors_origins = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3002",
    "https://hedge-edge.com",
    "https://www.hedge-edge.com",
    "https://api.hedge-edge.com",
    "app://.",  # Electron app
]
if _is_dev:
    _cors_origins.extend([
        "http://localhost:5173",  # Vite dev server
        "http://localhost:8080",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
)


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ============================================================================
# Cost Protection Middleware (Railway Usage-Based Billing Guard)
# ============================================================================

@app.middleware("http")
async def cost_protection_middleware(request: Request, call_next):
    """
    Reject requests if daily cap exceeded — prevents runaway Railway bills.
    Health checks are exempt so Railway doesn't think the service is dead.
    """
    if request.url.path == "/health":
        return await call_next(request)
    
    if not daily_guard.check():
        logger.critical(f"Daily request cap ({config.MAX_DAILY_REQUESTS}) exceeded! Rejecting requests until midnight UTC.")
        return JSONResponse(
            status_code=503,
            content={
                "valid": False,
                "message": "Daily request limit exceeded. Service will resume at midnight UTC.",
                "code": "ERROR_DAILY_LIMIT"
            }
        )
    return await call_next(request)


# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "valid": False,
            "message": exc.detail,
            "code": f"HTTP_{exc.status_code}"
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "valid": False,
            "message": "Internal server error",
            "code": "ERROR_INTERNAL"
        }
    )


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for load balancers and client clock-drift detection"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "serverTime": int(datetime.now(timezone.utc).timestamp()),
        "version": config.API_VERSION,
    }


@app.get("/v1/license/status", response_model=StatusResponse, tags=["Status"])
@limiter.limit(config.RATE_LIMIT)
async def license_status(request: Request):
    """Get server status and statistics"""
    try:
        db = get_supabase()
        
        # Count active licenses
        licenses_result = db.table("licenses")\
            .select("id", count="exact")\
            .eq("is_active", True)\
            .execute()
        
        # Count active devices
        devices_result = db.table("license_devices")\
            .select("id", count="exact")\
            .eq("is_active", True)\
            .execute()
        
        return StatusResponse(
            status="online",
            timestamp=datetime.now(timezone.utc).isoformat(),
            version=config.API_VERSION,
            activeLicenses=licenses_result.count or 0,
            totalDevices=devices_result.count or 0
        )
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        return StatusResponse(
            status="degraded",
            timestamp=datetime.now(timezone.utc).isoformat(),
            version=config.API_VERSION
        )


# ============================================================================
# License Validation Endpoint
# ============================================================================

@app.post("/v1/license/validate", tags=["License"])
@limiter.limit(config.RATE_LIMIT)
async def validate_license(request: Request, body: ValidateRequest):
    """
    Validate a license key and issue a session token.
    
    Flow:
    1. Cross-check with Creem API (is subscription active/paid?)
    2. Look up license in Supabase (device limits, plan, features)
    3. Register device and issue session token
    4. Return server timestamp for client clock-drift detection
    """
    client_ip = get_client_ip(request)
    license_key = body.effective_license_key
    device_id = body.effective_device_id
    
    if not license_key:
        return JSONResponse(status_code=400, content={"valid": False, "message": "License key is required", "code": "ERROR_MISSING_KEY"})
    if not device_id or device_id == "unknown":
        return JSONResponse(status_code=400, content={"valid": False, "message": "Device ID is required", "code": "ERROR_MISSING_DEVICE"})
    
    logger.info(f"Validation request - Key: {license_key[:8]}..., Device: {device_id[:12]}..., Platform: {body.platform}, IP: {hash_ip(client_ip)}")
    
    try:
        # ── Step 1: Cross-check with Creem API ──
        creem_result = await validate_license_with_creem(license_key, body.instance_name)
        
        if not creem_result["valid"] and creem_result.get("status") != "unchecked":
            logger.warning(f"Creem rejected license: {creem_result}")
            await log_validation_attempt(
                get_supabase(), license_key, device_id, body.platform, client_ip,
                success=False, error_code="ERROR_CREEM_REJECTED",
                error_message=creem_result.get("error", "Payment not active")
            )
            return JSONResponse(
                status_code=403,
                content={
                    "valid": False,
                    "message": creem_result.get("error", "License subscription is not active. Please check your payment status."),
                    "code": "ERROR_CREEM_REJECTED",
                    "serverTime": int(datetime.now(timezone.utc).timestamp()),
                }
            )
        
        # ── Step 2: Look up in Supabase ──
        db = get_supabase()
        
        license_result = db.table("licenses")\
            .select("*")\
            .eq("license_key", license_key)\
            .single()\
            .execute()
        
        if not license_result.data:
            logger.warning(f"Invalid license key: {license_key[:8]}...")
            await log_validation_attempt(
                db, license_key, device_id, body.platform, client_ip,
                success=False, error_code="ERROR_INVALID_KEY", error_message="License key not found"
            )
            return JSONResponse(
                status_code=401,
                content={
                    "valid": False,
                    "message": "Invalid license key",
                    "code": "ERROR_INVALID_KEY",
                    "serverTime": int(datetime.now(timezone.utc).timestamp()),
                }
            )
        
        license_data = license_result.data
        
        # Check if license is active
        if not license_data.get("is_active", False):
            logger.warning(f"Inactive license: {license_key[:8]}...")
            await log_validation_attempt(
                db, license_key, device_id, body.platform, client_ip,
                success=False, error_code="ERROR_INACTIVE", error_message="License is inactive"
            )
            return JSONResponse(
                status_code=403,
                content={
                    "valid": False,
                    "message": "License is inactive",
                    "code": "ERROR_INACTIVE",
                    "serverTime": int(datetime.now(timezone.utc).timestamp()),
                }
            )
        
        # Check expiration
        expires_at = datetime.fromisoformat(license_data["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires_at:
            logger.warning(f"Expired license: {license_key[:8]}...")
            await log_validation_attempt(
                db, license_key, device_id, body.platform, client_ip,
                success=False, error_code="ERROR_EXPIRED", error_message="License has expired"
            )
            return JSONResponse(
                status_code=403,
                content={
                    "valid": False,
                    "message": "License has expired",
                    "code": "ERROR_EXPIRED",
                    "expiresAt": license_data["expires_at"],
                    "serverTime": int(datetime.now(timezone.utc).timestamp()),
                }
            )
        
        license_id = license_data["id"]
        max_devices = license_data.get("max_devices", 1)
        
        # Check if device is already registered
        device_result = db.table("license_devices")\
            .select("*")\
            .eq("license_id", license_id)\
            .eq("device_id", device_id)\
            .eq("is_active", True)\
            .execute()
        
        if device_result.data:
            # Existing device - update last seen
            db.table("license_devices")\
                .update({
                    "last_seen_at": datetime.now(timezone.utc).isoformat(),
                    "platform": body.platform,
                    "version": body.version,
                    "account_id": body.accountId,
                    "broker": body.broker,
                    "ip_address": hash_ip(client_ip)
                })\
                .eq("id", device_result.data[0]["id"])\
                .execute()
            
            logger.info(f"Existing device updated: {device_id[:12]}...")
        else:
            # New device - check device limit
            active_devices_result = db.table("license_devices")\
                .select("id", count="exact")\
                .eq("license_id", license_id)\
                .eq("is_active", True)\
                .execute()
            
            active_count = active_devices_result.count or 0
            
            if active_count >= max_devices:
                logger.warning(f"Device limit reached: {active_count}/{max_devices}")
                await log_validation_attempt(
                    db, license_key, device_id, body.platform, client_ip,
                    success=False, error_code="ERROR_DEVICE_LIMIT",
                    error_message=f"Device limit reached ({active_count}/{max_devices})"
                )
                return JSONResponse(
                    status_code=403,
                    content={
                        "valid": False,
                        "message": f"Device limit reached ({active_count}/{max_devices}). Deactivate another device first.",
                        "code": "ERROR_DEVICE_LIMIT",
                        "devicesUsed": active_count,
                        "maxDevices": max_devices,
                        "serverTime": int(datetime.now(timezone.utc).timestamp()),
                    }
                )
            
            # Register new device
            db.table("license_devices").insert({
                "license_id": license_id,
                "device_id": device_id,
                "platform": body.platform,
                "account_id": body.accountId,
                "broker": body.broker,
                "version": body.version,
                "ip_address": hash_ip(client_ip),
                "is_active": True
            }).execute()
            
            logger.info(f"New device registered: {device_id[:12]}...")
        
        # Generate session token
        token = generate_token(license_key, device_id)
        token_expires = datetime.now(timezone.utc) + timedelta(seconds=config.TOKEN_TTL_SECONDS)
        
        # Store session
        db.table("license_sessions").insert({
            "license_id": license_id,
            "device_id": device_id,
            "token": token,
            "expires_at": token_expires.isoformat(),
            "ip_address": hash_ip(client_ip)
        }).execute()
        
        # Get current device count
        final_devices_result = db.table("license_devices")\
            .select("id", count="exact")\
            .eq("license_id", license_id)\
            .eq("is_active", True)\
            .execute()
        
        devices_used = final_devices_result.count or 1
        
        # Log successful validation
        await log_validation_attempt(
            db, license_key, device_id, body.platform, client_ip,
            success=True
        )
        
        logger.info(f"Validation successful: {license_key[:8]}... on {device_id[:12]}...")
        
        return JSONResponse(
            status_code=200,
            content={
                "valid": True,
                "token": token,
                "ttlSeconds": config.TOKEN_TTL_SECONDS,
                "plan": license_data.get("plan", "demo"),
                "features": license_data.get("features", []),
                "expiresAt": license_data["expires_at"],
                "email": license_data.get("email"),
                "devicesUsed": devices_used,
                "maxDevices": max_devices,
                "serverTime": int(datetime.now(timezone.utc).timestamp()),
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "valid": False,
                "message": "Internal server error",
                "code": "ERROR_INTERNAL"
            }
        )


# ============================================================================
# Heartbeat Endpoint
# ============================================================================

@app.post("/v1/license/heartbeat", response_model=HeartbeatResponse, tags=["License"])
@limiter.limit(config.RATE_LIMIT)
async def heartbeat(request: Request, body: HeartbeatRequest):
    """
    Refresh session token and report connection status.
    
    This endpoint should be called periodically to:
    1. Keep the session alive
    2. Report account status (balance, equity, positions)
    3. Get a refreshed token if near expiry
    """
    client_ip = get_client_ip(request)
    
    try:
        db = get_supabase()
        
        # Look up session
        session_result = db.table("license_sessions")\
            .select("*")\
            .eq("token", body.token)\
            .eq("device_id", body.deviceId)\
            .single()\
            .execute()
        
        if not session_result.data:
            logger.warning(f"Invalid session token: {body.token[:16]}...")
            raise HTTPException(status_code=401, detail="Invalid or expired session token")
        
        session_data = session_result.data
        expires_at = datetime.fromisoformat(session_data["expires_at"].replace("Z", "+00:00"))
        
        # Check if session expired
        if datetime.now(timezone.utc) > expires_at:
            logger.warning(f"Expired session: {body.token[:16]}...")
            # Clean up expired session
            db.table("license_sessions").delete().eq("id", session_data["id"]).execute()
            raise HTTPException(status_code=401, detail="Session expired, please re-validate")
        
        # Update heartbeat and status
        update_data = {
            "last_heartbeat_at": datetime.now(timezone.utc).isoformat(),
            "ip_address": hash_ip(client_ip)
        }
        if body.status:
            update_data["status"] = body.status
        
        db.table("license_sessions")\
            .update(update_data)\
            .eq("id", session_data["id"])\
            .execute()
        
        # Also update device last seen
        db.table("license_devices")\
            .update({"last_seen_at": datetime.now(timezone.utc).isoformat()})\
            .eq("license_id", session_data["license_id"])\
            .eq("device_id", body.deviceId)\
            .execute()
        
        # Check if token needs refresh
        time_remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
        new_token = None
        ttl = int(time_remaining)
        
        if time_remaining < config.TOKEN_REFRESH_THRESHOLD:
            # Generate new token
            license_result = db.table("licenses")\
                .select("license_key")\
                .eq("id", session_data["license_id"])\
                .single()\
                .execute()
            
            if license_result.data:
                new_token = generate_token(license_result.data["license_key"], body.deviceId)
                new_expires = datetime.now(timezone.utc) + timedelta(seconds=config.TOKEN_TTL_SECONDS)
                
                # Update session with new token
                db.table("license_sessions")\
                    .update({
                        "token": new_token,
                        "expires_at": new_expires.isoformat()
                    })\
                    .eq("id", session_data["id"])\
                    .execute()
                
                ttl = config.TOKEN_TTL_SECONDS
                logger.info(f"Token refreshed for device: {body.deviceId[:12]}...")
        
        return HeartbeatResponse(
            valid=True,
            newToken=new_token,
            ttlSeconds=ttl
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Heartbeat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# Deactivation Endpoint
# ============================================================================

@app.post("/v1/license/deactivate", response_model=DeactivateResponse, tags=["License"])
@limiter.limit(config.RATE_LIMIT)
async def deactivate_device(request: Request, body: DeactivateRequest):
    """
    Deactivate a device to free up a license slot.
    
    This allows users to move their license to a different device
    without contacting support.
    """
    client_ip = get_client_ip(request)
    license_key = body.effective_license_key
    device_id = body.effective_device_id
    
    if not license_key or not device_id:
        raise HTTPException(status_code=400, detail="license_key and device_id are required")
    
    logger.info(f"Deactivation request - Key: {license_key[:8]}..., Device: {device_id[:12]}...")
    
    try:
        db = get_supabase()
        
        # Look up license
        license_result = db.table("licenses")\
            .select("id")\
            .eq("license_key", license_key)\
            .single()\
            .execute()
        
        if not license_result.data:
            raise HTTPException(status_code=401, detail="Invalid license key")
        
        license_id = license_result.data["id"]
        
        # Find and deactivate the device
        device_result = db.table("license_devices")\
            .select("id")\
            .eq("license_id", license_id)\
            .eq("device_id", device_id)\
            .eq("is_active", True)\
            .single()\
            .execute()
        
        if not device_result.data:
            raise HTTPException(status_code=404, detail="Device not found or already deactivated")
        
        # Deactivate device
        db.table("license_devices")\
            .update({
                "is_active": False,
                "deactivated_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", device_result.data["id"])\
            .execute()
        
        # Delete associated sessions
        db.table("license_sessions")\
            .delete()\
            .eq("license_id", license_id)\
            .eq("device_id", device_id)\
            .execute()
        
        # Count remaining active devices
        remaining_result = db.table("license_devices")\
            .select("id", count="exact")\
            .eq("license_id", license_id)\
            .eq("is_active", True)\
            .execute()
        
        devices_remaining = remaining_result.count or 0
        
        logger.info(f"Device deactivated: {device_id[:12]}... ({devices_remaining} devices remaining)")
        
        return DeactivateResponse(
            success=True,
            devicesRemaining=devices_remaining
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Deactivation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# Creem Webhook Endpoint (Subscription Lifecycle Events)
# ============================================================================

@app.post("/v1/webhooks/creem", tags=["Webhooks"])
async def creem_webhook(request: Request):
    """
    Receive Creem subscription lifecycle events.
    
    When a user cancels, refunds, or their subscription lapses,
    Creem sends a webhook here. We update the Supabase license
    record immediately so the next validation check rejects them.
    
    Events handled:
    - subscription.cancelled → set is_active = false
    - subscription.expired → set is_active = false
    - charge.refunded → set is_active = false
    - subscription.renewed → set is_active = true, extend expires_at
    """
    try:
        payload = await request.body()
        
        # Always verify webhook signature
        signature = request.headers.get("x-creem-signature", "")
        if not verify_creem_webhook_signature(payload, signature):
            logger.warning(f"Invalid webhook signature from {get_client_ip(request)}")
            return JSONResponse(status_code=401, content={"error": "Invalid signature"})
        
        import json
        event = json.loads(payload)
        event_type = event.get("type", "unknown")
        event_data = event.get("data", {})
        
        logger.info(f"Creem webhook received: {event_type}")
        
        # Extract license key from event data
        license_key = event_data.get("license_key") or event_data.get("key", "")
        if not license_key:
            # Try to find it in nested objects
            license_obj = event_data.get("license", {})
            license_key = license_obj.get("key", "") if isinstance(license_obj, dict) else ""
        
        if not license_key:
            logger.warning(f"Webhook event {event_type} missing license key")
            return {"received": True, "processed": False, "reason": "no license key in event"}
        
        license_key = license_key.upper().strip()
        
        try:
            db = get_supabase()
        except Exception:
            logger.error("Cannot process webhook — Supabase not configured")
            return {"received": True, "processed": False, "reason": "database not configured"}
        
        # Handle deactivation events
        if event_type in ("subscription.cancelled", "subscription.expired", "charge.refunded", "license.revoked"):
            result = db.table("licenses")\
                .update({"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()})\
                .eq("license_key", license_key)\
                .execute()
            
            affected = len(result.data) if result.data else 0
            logger.info(f"Webhook {event_type}: deactivated license {license_key[:8]}... (rows: {affected})")
            
            return {"received": True, "processed": True, "action": "deactivated", "affected": affected}
        
        # Handle reactivation events
        elif event_type in ("subscription.renewed", "subscription.reactivated", "charge.succeeded"):
            update_data = {"is_active": True}
            
            # If renewal includes a new expiry date
            new_expires = event_data.get("expires_at") or event_data.get("current_period_end")
            if new_expires:
                update_data["expires_at"] = new_expires
            
            result = db.table("licenses")\
                .update(update_data)\
                .eq("license_key", license_key)\
                .execute()
            
            affected = len(result.data) if result.data else 0
            logger.info(f"Webhook {event_type}: reactivated license {license_key[:8]}... (rows: {affected})")
            
            return {"received": True, "processed": True, "action": "reactivated", "affected": affected}
        
        else:
            logger.info(f"Webhook event type '{event_type}' not handled — ignoring")
            return {"received": True, "processed": False, "reason": f"unhandled event type: {event_type}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)
        # Return 200 so Creem doesn't retry continuously
        return {"received": True, "processed": False, "error": "Webhook processing failed"}


# ============================================================================
# Run Server (Development)
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting development server on {host}:{port}")
    
    uvicorn.run(
        "license_api_production:app",
        host=host,
        port=port,
        reload=_is_dev,
        log_level=config.LOG_LEVEL.lower()
    )
