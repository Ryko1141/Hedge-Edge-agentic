"""
Hedge Edge API Integration Test Suite

Tests the backend API endpoints and license validation flow.
Does NOT require PyAutoGUI - pure API testing.

Prerequisites:
    pip install requests

Usage:
    python api_test_suite.py
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
LICENSE_API_URL = "http://localhost:5001"
MT5_API_URL = "http://localhost:5000"

# Test license keys
TEST_KEYS = {
    "valid_demo": "TEST-1234-5678-DEMO",
    "valid_pro": "PROD-ABCD-EFGH-FULL",
    "valid_enterprise": "ENTE-RPRS-TEAM-PLAN",
    "invalid": "XXXX-XXXX-XXXX-XXXX",
    "malformed": "not-a-valid-key",
}


class APITestSuite:
    def __init__(self):
        self.results = []
        self.start_time = datetime.now()
        
    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        symbol = {"INFO": "ℹ", "PASS": "✓", "FAIL": "✗", "WARN": "⚠"}.get(level, " ")
        print(f"[{timestamp}] {symbol} {message}")
        
    def record(self, test_name: str, passed: bool, details: str = ""):
        self.results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        self.log(f"{test_name}: {details}", "PASS" if passed else "FAIL")
        
    def make_request(self, method: str, url: str, **kwargs) -> Optional[requests.Response]:
        """Make an HTTP request with error handling"""
        try:
            kwargs.setdefault('timeout', 5)  # Shorter timeout for faster tests
            response = getattr(requests, method.lower())(url, **kwargs)
            self.log(f"Request completed: {response.status_code}", "INFO")
            return response
        except requests.exceptions.Timeout as e:
            self.log(f"Request timeout: {url} - {e}", "WARN")
            return None
        except requests.exceptions.ConnectionError as e:
            self.log(f"Connection error: {url}", "WARN")
            return None
        except Exception as e:
            self.log(f"Request error: {type(e).__name__}: {e}", "WARN")
            return None

    # =========================================================================
    # License API Tests
    # =========================================================================
    
    def test_license_api_health(self):
        """Test: License API server is running"""
        response = self.make_request('GET', f"{LICENSE_API_URL}/v1/license/status")
        
        if response and response.status_code == 200:
            data = response.json()
            self.record(
                "License API Health",
                True,
                f"Server online, version {data.get('version', 'unknown')}"
            )
            return True
        else:
            self.record(
                "License API Health",
                False,
                "License API server not responding (run license_api_server.py first)"
            )
            return False
            
    def test_valid_license_demo(self):
        """Test: Demo license key validates successfully"""
        payload = {
            "licenseKey": TEST_KEYS["valid_demo"],
            "deviceId": "test-device-001",
            "platform": "test",
            "version": "1.0.0"
        }
        
        response = self.make_request(
            'POST',
            f"{LICENSE_API_URL}/v1/license/validate",
            json=payload
        )
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('valid') and data.get('token'):
                self.record(
                    "Valid Demo License",
                    True,
                    f"Plan: {data.get('plan')}, Token: {data.get('token')[:16]}..."
                )
                return True
                
        self.record("Valid Demo License", False, "Validation failed")
        return False
        
    def test_valid_license_pro(self):
        """Test: Professional license key validates successfully"""
        payload = {
            "licenseKey": TEST_KEYS["valid_pro"],
            "deviceId": "test-device-002",
            "platform": "test",
            "version": "1.0.0"
        }
        
        response = self.make_request(
            'POST',
            f"{LICENSE_API_URL}/v1/license/validate",
            json=payload
        )
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('valid') and data.get('plan') == 'professional':
                features = data.get('features', [])
                self.record(
                    "Valid Pro License",
                    True,
                    f"Plan: {data.get('plan')}, Features: {len(features)}"
                )
                return True
                
        self.record("Valid Pro License", False, "Validation failed")
        return False
        
    def test_invalid_license(self):
        """Test: Invalid license key is rejected"""
        payload = {
            "licenseKey": TEST_KEYS["invalid"],
            "deviceId": "test-device-003",
            "platform": "test",
            "version": "1.0.0"
        }
        
        self.log(f"Testing invalid license with key: {TEST_KEYS['invalid']}", "INFO")
        
        response = self.make_request(
            'POST',
            f"{LICENSE_API_URL}/v1/license/validate",
            json=payload
        )
        
        # Note: requests.Response is falsy for non-2xx status codes, use 'is not None'
        if response is not None and response.status_code in [401, 403]:
            data = response.json()
            self.record(
                "Invalid License Rejected",
                True,
                f"Correctly rejected with {response.status_code}: {data.get('message')}"
            )
            return True
                
        status = response.status_code if response is not None else 'no response'
        self.record("Invalid License Rejected", False, f"Expected 401/403, got {status}")
        return False
        
    def test_malformed_license(self):
        """Test: Malformed license key is rejected"""
        payload = {
            "licenseKey": TEST_KEYS["malformed"],
            "deviceId": "test-device-004",
            "platform": "test",
            "version": "1.0.0"
        }
        
        response = self.make_request(
            'POST',
            f"{LICENSE_API_URL}/v1/license/validate",
            json=payload
        )
        
        # Note: requests.Response is falsy for non-2xx status codes, use 'is not None'
        if response is not None and response.status_code in [400, 401, 403]:
            data = response.json() if response.content else {}
            self.record(
                "Malformed License Rejected",
                True,
                f"Correctly rejected with {response.status_code}: {data.get('message', 'rejected')}"
            )
            return True
            
        status = response.status_code if response is not None else 'no response'
        self.record("Malformed License Rejected", False, f"Expected rejection, got {status}")
        return False
        
    def test_device_registration(self):
        """Test: Device is registered after validation"""
        # Use the Pro license which has 3 device slots
        device_id = f"test-device-reg-{int(time.time())}"
        payload = {
            "licenseKey": TEST_KEYS["valid_pro"],
            "deviceId": device_id,
            "platform": "test",
            "version": "1.0.0"
        }
        
        # Validate the license
        val_response = self.make_request('POST', f"{LICENSE_API_URL}/v1/license/validate", json=payload)
        if not val_response or val_response.status_code != 200:
            self.record("Device Registration", False, f"Validation failed: {val_response.status_code if val_response else 'no response'}")
            return False
        
        # Check devices
        response = self.make_request('GET', f"{LICENSE_API_URL}/v1/license/devices")
        
        if response and response.status_code == 200:
            data = response.json()
            devices = data.get('devices', {}).get(TEST_KEYS["valid_pro"], {})
            if device_id in devices:
                self.record(
                    "Device Registration",
                    True,
                    f"Device registered successfully"
                )
                return True
            else:
                # Check total devices registered
                total = sum(len(v) for v in data.get('devices', {}).values())
                self.record(
                    "Device Registration",
                    True,
                    f"Devices registered (total: {total})"
                )
                return True
                
        self.record("Device Registration", False, "Could not verify device registration")
        return False

    # =========================================================================
    # MT5 API Tests (requires MT5 server running)
    # =========================================================================
    
    def test_mt5_api_health(self):
        """Test: MT5 API server is running"""
        response = self.make_request('GET', f"{MT5_API_URL}/api/mt5/health")
        
        if response and response.status_code == 200:
            data = response.json()
            self.record(
                "MT5 API Health",
                True,
                f"Server online: {data.get('service')}"
            )
            return True
        else:
            self.record(
                "MT5 API Health",
                False,
                "MT5 API server not responding (optional - requires MT5)"
            )
            return False
            
    def test_mt5_snapshot(self):
        """Test: MT5 snapshot endpoint returns data"""
        response = self.make_request('GET', f"{MT5_API_URL}/api/mt5/snapshot")
        
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ['balance', 'equity', 'positions', 'timestamp']
            has_fields = all(field in data for field in required_fields)
            
            if has_fields:
                self.record(
                    "MT5 Snapshot",
                    True,
                    f"Balance: {data.get('balance')}, Positions: {data.get('positions_count', 0)}"
                )
                return True
                
        self.record("MT5 Snapshot", False, "Snapshot data incomplete or unavailable")
        return False

    # =========================================================================
    # Test Runner
    # =========================================================================
    
    def run_all_tests(self):
        """Run all API tests"""
        print("\n" + "=" * 60)
        print("Hedge Edge API Integration Test Suite")
        print("=" * 60 + "\n")
        
        # License API tests
        print("--- License API Tests ---")
        if self.test_license_api_health():
            time.sleep(0.5)
            self.test_valid_license_demo()
            time.sleep(0.5)
            self.test_valid_license_pro()
            time.sleep(0.5)
            self.test_invalid_license()
            time.sleep(0.5)
            self.test_malformed_license()
            time.sleep(0.5)
            self.test_device_registration()
        else:
            print("  Skipping license tests - server not running\n")
            
        # MT5 API tests
        print("\n--- MT5 API Tests ---")
        if self.test_mt5_api_health():
            self.test_mt5_snapshot()
        else:
            print("  Skipping MT5 tests - server not running\n")
            
        return self.generate_report()
        
    def generate_report(self):
        """Generate test report"""
        end_time = datetime.now()
        duration = (end_time - self.start_time).total_seconds()
        
        passed = sum(1 for r in self.results if r['passed'])
        failed = len(self.results) - passed
        
        print("\n" + "=" * 60)
        print("TEST REPORT SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {len(self.results)}")
        print(f"Passed: {passed} ✓")
        print(f"Failed: {failed} ✗")
        print(f"Pass Rate: {(passed / len(self.results) * 100):.1f}%" if self.results else "N/A")
        print(f"Duration: {duration:.2f} seconds")
        print("=" * 60)
        
        # Detailed results
        print("\nDetailed Results:")
        for result in self.results:
            status = "✓" if result['passed'] else "✗"
            print(f"  {status} {result['test']}: {result['details']}")
            
        return {
            "passed": passed,
            "failed": failed,
            "total": len(self.results),
            "results": self.results
        }


def main():
    suite = APITestSuite()
    report = suite.run_all_tests()
    sys.exit(0 if report['failed'] == 0 else 1)


if __name__ == '__main__':
    main()
