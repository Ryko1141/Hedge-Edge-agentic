"""
Tests for Hedge Edge License API Production Server
====================================================
Uses httpx.AsyncClient with FastAPI's TestClient pattern.
"""

import pytest
import hashlib
import hmac
import os
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone

# Patch environment BEFORE importing the app module so validate_environment() passes
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("CREEM_API_KEY", "test-creem-key")
os.environ.setdefault("CREEM_WEBHOOK_SECRET", "test-webhook-secret")

from httpx import AsyncClient, ASGITransport
from license_api_production import app, generate_token, DailyRequestGuard, hash_ip


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async test client for FastAPI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ============================================================================
# Health Endpoint
# ============================================================================

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_200(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data
        assert "serverTime" in data

    @pytest.mark.asyncio
    async def test_health_has_server_time(self, client: AsyncClient):
        resp = await client.get("/health")
        data = resp.json()
        assert isinstance(data["serverTime"], int)
        assert data["serverTime"] > 0


# ============================================================================
# License Validation Endpoint
# ============================================================================

class TestValidateEndpoint:
    @pytest.mark.asyncio
    async def test_validate_missing_key_returns_400(self, client: AsyncClient):
        resp = await client.post("/v1/license/validate", json={
            "deviceId": "device-test-12345678",
            "platform": "mt5",
        })
        assert resp.status_code == 400
        data = resp.json()
        assert data["valid"] is False

    @pytest.mark.asyncio
    async def test_validate_rejects_short_device_id(self, client: AsyncClient):
        resp = await client.post("/v1/license/validate", json={
            "licenseKey": "TESTKEY-1234-ABCD",
            "deviceId": "short",
            "platform": "mt5",
        })
        # FastAPI validation should reject device_id < 8 chars
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_validate_normalises_platform(self, client: AsyncClient):
        """Platform field should be lowercased and default unknown for bad values."""
        resp = await client.post("/v1/license/validate", json={
            "licenseKey": "TESTKEY-1234-ABCD",
            "deviceId": "device-test-12345678",
            "platform": "INVALID_PLATFORM",
        })
        # The request should still be processed (platform defaults to 'unknown')
        # It may fail for other reasons (Creem/Supabase not available) but not 422
        assert resp.status_code != 422


# ============================================================================
# Heartbeat Endpoint
# ============================================================================

class TestHeartbeatEndpoint:
    @pytest.mark.asyncio
    async def test_heartbeat_rejects_short_token(self, client: AsyncClient):
        resp = await client.post("/v1/license/heartbeat", json={
            "token": "short",
            "deviceId": "device-test-12345678",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_heartbeat_rejects_missing_device(self, client: AsyncClient):
        token = "a" * 64
        resp = await client.post("/v1/license/heartbeat", json={
            "token": token,
        })
        assert resp.status_code == 422


# ============================================================================
# Deactivate Endpoint
# ============================================================================

class TestDeactivateEndpoint:
    @pytest.mark.asyncio
    async def test_deactivate_accepts_snake_case(self, client: AsyncClient):
        """Endpoint should accept both camelCase and snake_case fields."""
        resp = await client.post("/v1/license/deactivate", json={
            "license_key": "TESTKEY-1234-ABCD",
            "device_id": "device-test-12345678",
        })
        # Will fail at business logic level but should not be 422
        assert resp.status_code != 422


# ============================================================================
# Helper Functions
# ============================================================================

class TestHelperFunctions:
    def test_generate_token_is_64_hex(self):
        token = generate_token("KEY-123", "device-abc-12345678")
        assert len(token) == 64
        assert all(c in "0123456789abcdef" for c in token)

    def test_generate_token_varies(self):
        t1 = generate_token("KEY-1", "d-12345678")
        t2 = generate_token("KEY-1", "d-12345678")
        assert t1 != t2  # each call has random bytes

    def test_hash_ip_is_deterministic(self):
        h1 = hash_ip("192.168.1.1")
        h2 = hash_ip("192.168.1.1")
        assert h1 == h2

    def test_hash_ip_differs_for_different_ips(self):
        assert hash_ip("192.168.1.1") != hash_ip("10.0.0.1")


# ============================================================================
# Daily Request Guard
# ============================================================================

class TestDailyRequestGuard:
    def test_allows_requests_under_limit(self):
        guard = DailyRequestGuard(max_daily=5)
        for _ in range(5):
            assert guard.check() is True

    def test_rejects_requests_over_limit(self):
        guard = DailyRequestGuard(max_daily=3)
        for _ in range(3):
            guard.check()
        assert guard.check() is False

    def test_get_count_tracks_requests(self):
        guard = DailyRequestGuard(max_daily=100)
        guard.check()
        guard.check()
        assert guard.get_count() == 2
