"""
Hedge Edge License Validation API Server (Development/Testing)

This is a local mock server for testing license validation.
In production, this would be hosted at api.hedge-edge.com

Run: python license_api_server.py
Endpoints:
- POST /v1/license/validate - Validate license key
- GET /v1/license/status - Check server status
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import collections
import functools
import hashlib
import secrets
import threading
import time
import json
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('license-api-dev')

app = Flask(__name__)
CORS(app, origins=['http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:3002', 'http://localhost:3002'])

# ============================================================================
# Mock License Database (In production, this would be a real database)
# ============================================================================

# License keys (add real keys here or load from environment/database)
TEST_LICENSES = {}

# Device tracking (in production, stored in database)
DEVICE_REGISTRATIONS = {}

# Active tokens (in production, use Redis or similar)
ACTIVE_TOKENS = {}

# Admin token for protected endpoints
ADMIN_TOKEN = os.getenv('DEV_ADMIN_TOKEN', secrets.token_urlsafe(32))

# ============================================================================
# Rate Limiting (per-IP sliding window)
# ============================================================================
RATE_LIMIT_WINDOW = 60          # seconds
RATE_LIMIT_MAX_REQUESTS = 20    # max requests per window per IP
_rate_limit_hits: dict[str, collections.deque] = {}


def _is_rate_limited(ip: str) -> bool:
    """Return True if the IP has exceeded the rate limit."""
    now = time.monotonic()
    if ip not in _rate_limit_hits:
        _rate_limit_hits[ip] = collections.deque()
    dq = _rate_limit_hits[ip]
    # Purge timestamps outside the window
    while dq and dq[0] <= now - RATE_LIMIT_WINDOW:
        dq.popleft()
    if len(dq) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    dq.append(now)
    return False


# ============================================================================
# Token TTL sweep (background thread)
# ============================================================================
TOKEN_SWEEP_INTERVAL = 300  # every 5 minutes


def _sweep_expired_tokens():
    """Periodically remove expired entries from ACTIVE_TOKENS."""
    while True:
        time.sleep(TOKEN_SWEEP_INTERVAL)
        now = datetime.now()
        expired = [t for t, v in ACTIVE_TOKENS.items() if v['expires'] <= now]
        for t in expired:
            ACTIVE_TOKENS.pop(t, None)
        if expired:
            logger.info(f"Token sweep: removed {len(expired)} expired token(s), {len(ACTIVE_TOKENS)} active")


_sweep_thread = threading.Thread(target=_sweep_expired_tokens, daemon=True)
_sweep_thread.start()


def require_admin(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if request.headers.get('X-Admin-Token') != ADMIN_TOKEN:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated


def generate_token(key: str, device: str) -> str:
    """Generate a cryptographically random token."""
    return secrets.token_urlsafe(48)


def get_device_count(license_key: str) -> int:
    """Count devices registered to a license"""
    return len(DEVICE_REGISTRATIONS.get(license_key, {}))


@app.route('/v1/license/validate', methods=['POST'])
def validate_license():
    """
    Validate a license key and device combination.
    
    Request Body:
    {
        "licenseKey": "XXXX-XXXX-XXXX-XXXX",
        "deviceId": "unique-device-hash",
        "platform": "desktop|mt5|ctrader",
        "version": "1.0.0"
    }
    
    Response:
    {
        "valid": true/false,
        "token": "session-token",
        "ttlSeconds": 3600,
        "message": "success/error message",
        "plan": "demo|professional|enterprise",
        "expiresAt": "2027-01-01T00:00:00Z"
    }
    """
    # --- Rate limiting ---
    client_ip = request.remote_addr or '0.0.0.0'
    if _is_rate_limited(client_ip):
        logger.warning(f"Rate limit exceeded for {client_ip}")
        return jsonify({
            "valid": False,
            "message": "Too many requests. Please try again later."
        }), 429

    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "valid": False,
                "message": "Invalid request body"
            }), 400
        
        license_key = data.get('licenseKey', '').strip().upper()
        device_id = data.get('deviceId', '').strip()
        platform = data.get('platform', 'unknown')
        version = data.get('version', '0.0.0')

        if not license_key or len(license_key) > 100:
            return jsonify({'valid': False, 'error': 'Invalid license key format'}), 400
        if not device_id or len(device_id) > 200:
            return jsonify({'valid': False, 'error': 'Invalid device ID format'}), 400
        
        logger.info(f"Validation request for key=****{license_key[-4:]}, device={device_id[:8]}...")
        
        # Check if license exists
        if license_key not in TEST_LICENSES:
            logger.info(f"Invalid key attempt: ****{license_key[-4:]}")
            return jsonify({
                "valid": False,
                "message": "Invalid license key"
            }), 401
        
        license_info = TEST_LICENSES[license_key]
        
        # Check expiration
        expires = datetime.strptime(license_info['expires'], '%Y-%m-%d')
        if datetime.now() > expires:
            logger.info(f"Expired key: ****{license_key[-4:]}")
            return jsonify({
                "valid": False,
                "message": "License has expired",
                "expiresAt": license_info['expires']
            }), 403
        
        # Check device limit
        if license_key not in DEVICE_REGISTRATIONS:
            DEVICE_REGISTRATIONS[license_key] = {}
        
        if device_id not in DEVICE_REGISTRATIONS[license_key]:
            current_devices = len(DEVICE_REGISTRATIONS[license_key])
            if current_devices >= license_info['max_devices']:
                logger.info(f"Device limit reached for ****{license_key[-4:]}: {current_devices}/{license_info['max_devices']}")
                return jsonify({
                    "valid": False,
                    "message": f"Device limit reached ({current_devices}/{license_info['max_devices']}). Deactivate another device first."
                }), 403
            
            # Register new device
            DEVICE_REGISTRATIONS[license_key][device_id] = {
                "registered": datetime.now().isoformat(),
                "platform": platform,
                "version": version,
                "last_seen": datetime.now().isoformat()
            }
            logger.info(f"New device registered for ****{license_key[-4:]}")
        else:
            # Update last seen
            DEVICE_REGISTRATIONS[license_key][device_id]['last_seen'] = datetime.now().isoformat()
            DEVICE_REGISTRATIONS[license_key][device_id]['version'] = version
        
        # Generate session token
        token = generate_token(license_key, device_id)
        ttl_seconds = 3600  # 1 hour
        
        ACTIVE_TOKENS[token] = {
            "license_key": license_key,
            "device_id": device_id,
            "expires": datetime.now() + timedelta(seconds=ttl_seconds)
        }
        
        logger.info(f"Validated successfully: ****{license_key[-4:]} on {device_id[:8]}...")
        
        return jsonify({
            "valid": True,
            "token": token,
            "ttlSeconds": ttl_seconds,
            "message": "License validated successfully",
            "plan": license_info['plan'],
            "expiresAt": f"{license_info['expires']}T00:00:00Z",
            "features": license_info['features'],
            "email": license_info['email']
        }), 200
        
    except Exception as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({
            "valid": False,
            "message": "Internal server error"
        }), 500


@app.route('/v1/license/status', methods=['GET'])
def license_status():
    """Get server status and statistics"""
    return jsonify({
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "active_licenses": len([k for k, v in DEVICE_REGISTRATIONS.items() if len(v) > 0]),
        "total_devices": sum(len(v) for v in DEVICE_REGISTRATIONS.values())
    }), 200


@app.route('/v1/license/devices', methods=['GET'])
@require_admin
def list_devices():
    """List registered devices (admin-only)"""
    return jsonify({
        "devices": DEVICE_REGISTRATIONS
    }), 200


@app.route('/v1/license/revoke', methods=['POST'])
@require_admin
def revoke_device():
    """Revoke a device registration (admin-only)"""
    data = request.get_json()
    license_key = data.get('licenseKey', '').upper()
    device_id = data.get('deviceId')
    
    if license_key in DEVICE_REGISTRATIONS:
        if device_id in DEVICE_REGISTRATIONS[license_key]:
            del DEVICE_REGISTRATIONS[license_key][device_id]
            return jsonify({"success": True, "message": "Device revoked"}), 200
    
    return jsonify({"success": False, "message": "Device not found"}), 404


if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("Hedge Edge License API Server (Development)")
    logger.info("=" * 60)
    logger.info("No test license keys configured.")
    logger.info("Add license keys to TEST_LICENSES dict or load from environment.")
    logger.info("Endpoints:")
    logger.info("  POST http://localhost:5001/v1/license/validate")
    logger.info("  GET  http://localhost:5001/v1/license/status")
    logger.info("  GET  http://localhost:5001/v1/license/devices (admin-only)")
    logger.info("  POST http://localhost:5001/v1/license/revoke (admin-only)")
    logger.info(f"Admin token: {ADMIN_TOKEN[:8]}...{ADMIN_TOKEN[-4:]} (set DEV_ADMIN_TOKEN env var to override)")
    logger.info("=" * 60)
    
    app.run(debug=False, host='127.0.0.1', port=5001)
