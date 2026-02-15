import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for testing."""
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock.table.return_value.insert.return_value.execute.return_value.data = [{"id": "test"}]
    with patch.dict(os.environ, {
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_KEY": "test-key",
        "CREEM_API_KEY": "test-creem-key",
        "CREEM_WEBHOOK_SECRET": "test-webhook-secret",
    }):
        with patch("license_api_production.supabase", mock):
            yield mock


@pytest.fixture
def mock_creem():
    """Mock Creem API responses."""
    with patch("httpx.AsyncClient") as mock_client:
        yield mock_client
