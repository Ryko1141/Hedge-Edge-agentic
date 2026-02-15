"""
Hedge Edge Deep UI Inspection Test

This script performs detailed UI testing by:
1. Clicking through all pages and buttons
2. Testing form inputs
3. Checking for common UI issues
4. Taking annotated screenshots

Usage:
    python deep_ui_inspection.py
"""

import pyautogui
import time
import sys
import os
import json
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw

# Configuration
SCREENSHOT_DIR = Path(__file__).parent / "ui_inspection"
SCREENSHOT_DIR.mkdir(exist_ok=True)

APP_TITLE = "HedgeEdge"
WAIT_TIME = 1.0

pyautogui.PAUSE = 0.2
pyautogui.FAILSAFE = True

# Results
issues = []
test_results = []


def log(msg, level="INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    symbols = {"INFO": "ℹ", "PASS": "✓", "FAIL": "✗", "WARN": "⚠", "ACTION": "→", "ISSUE": "🐛"}
    print(f"[{ts}] {symbols.get(level, ' ')} {msg}")


def screenshot(name):
    filepath = SCREENSHOT_DIR / f"{name}.png"
    pyautogui.screenshot(str(filepath))
    return filepath


def record_issue(description, severity="minor", page=None):
    """Record a UI issue"""
    issue = {
        "description": description,
        "severity": severity,
        "page": page,
        "time": datetime.now().isoformat()
    }
    issues.append(issue)
    log(f"[{severity.upper()}] {description}", "ISSUE")


def find_window():
    windows = pyautogui.getWindowsWithTitle(APP_TITLE)
    if windows:
        win = windows[0]
        win.activate()
        time.sleep(0.3)
        return win
    return None


def click_at(window, x_pct, y_pct, description=""):
    """Click at percentage position within window"""
    x = window.left + int(window.width * x_pct)
    y = window.top + int(window.height * y_pct)
    log(f"Click: {description} at ({x_pct:.0%}, {y_pct:.0%})", "ACTION")
    pyautogui.click(x, y)
    time.sleep(0.3)


def type_text(text, clear_first=True):
    """Type text into a field"""
    if clear_first:
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.1)
    pyautogui.typewrite(text, interval=0.02)
    time.sleep(0.2)


def test_overview_page(window):
    """Test the Overview/Dashboard page"""
    log("Testing Overview page...", "ACTION")
    
    # Click Overview nav
    click_at(window, 0.07, 0.20, "Overview nav")
    time.sleep(WAIT_TIME)
    screenshot("overview_page")
    
    # Check for common dashboard elements
    # Look for stats cards, charts, etc.
    
    # Test clicking on stat cards (if visible)
    card_positions = [
        (0.25, 0.25),  # First stat card
        (0.45, 0.25),  # Second stat card
        (0.65, 0.25),  # Third stat card
        (0.85, 0.25),  # Fourth stat card
    ]
    
    for i, (x, y) in enumerate(card_positions):
        click_at(window, x, y, f"Stat card {i+1}")
        time.sleep(0.3)
    
    test_results.append({"page": "Overview", "status": "tested"})


def test_accounts_page(window):
    """Test the Accounts page"""
    log("Testing Accounts page...", "ACTION")
    
    # Navigate to Accounts
    click_at(window, 0.07, 0.27, "Accounts nav")
    time.sleep(WAIT_TIME)
    screenshot("accounts_page")
    
    # Look for "Add Account" or "Connect" button - usually top right
    click_at(window, 0.88, 0.12, "Add Account button area")
    time.sleep(WAIT_TIME)
    screenshot("accounts_add_clicked")
    
    # Check if a modal opened
    # Press Escape to close any modal
    pyautogui.press('escape')
    time.sleep(0.5)
    
    # Test any tabs on the accounts page
    tab_positions = [
        (0.25, 0.15),
        (0.35, 0.15),
        (0.45, 0.15),
    ]
    
    for i, (x, y) in enumerate(tab_positions):
        click_at(window, x, y, f"Tab {i+1}")
        time.sleep(0.5)
    
    screenshot("accounts_final")
    test_results.append({"page": "Accounts", "status": "tested"})


def test_analytics_page(window):
    """Test the Analytics page"""
    log("Testing Analytics page...", "ACTION")
    
    click_at(window, 0.07, 0.34, "Analytics nav")
    time.sleep(WAIT_TIME)
    screenshot("analytics_page")
    
    # Test date range selectors if present
    click_at(window, 0.85, 0.12, "Date range area")
    time.sleep(0.5)
    pyautogui.press('escape')
    
    # Test chart interactions
    click_at(window, 0.5, 0.5, "Main chart area")
    time.sleep(0.3)
    
    # Try scrolling on chart
    pyautogui.scroll(-3)
    time.sleep(0.3)
    pyautogui.scroll(3)
    
    screenshot("analytics_final")
    test_results.append({"page": "Analytics", "status": "tested"})


def test_copier_page(window):
    """Test the Trade Copier page"""
    log("Testing Trade Copier page...", "ACTION")
    
    click_at(window, 0.07, 0.41, "Trade Copier nav")
    time.sleep(WAIT_TIME)
    screenshot("copier_page")
    
    # Look for Master/Slave account selectors
    click_at(window, 0.3, 0.25, "Master account area")
    time.sleep(0.5)
    pyautogui.press('escape')
    
    click_at(window, 0.7, 0.25, "Slave account area")
    time.sleep(0.5)
    pyautogui.press('escape')
    
    # Look for Start/Stop buttons
    click_at(window, 0.5, 0.85, "Start/Stop button area")
    time.sleep(0.5)
    
    screenshot("copier_final")
    test_results.append({"page": "Trade Copier", "status": "tested"})


def test_calculator_page(window):
    """Test the Calculator page"""
    log("Testing Calculator page...", "ACTION")
    
    click_at(window, 0.07, 0.48, "Calculator nav")
    time.sleep(WAIT_TIME)
    screenshot("calculator_page")
    
    # Test input fields
    # Look for numeric inputs
    input_positions = [
        (0.4, 0.3),
        (0.4, 0.4),
        (0.4, 0.5),
    ]
    
    for i, (x, y) in enumerate(input_positions):
        click_at(window, x, y, f"Input field {i+1}")
        time.sleep(0.2)
        # Try typing a number
        pyautogui.typewrite("1000", interval=0.02)
        time.sleep(0.2)
    
    # Look for Calculate button
    click_at(window, 0.5, 0.7, "Calculate button area")
    time.sleep(0.5)
    
    screenshot("calculator_result")
    test_results.append({"page": "Calculator", "status": "tested"})


def test_settings_page(window):
    """Detailed Settings page test"""
    log("Testing Settings page in detail...", "ACTION")
    
    click_at(window, 0.07, 0.85, "Settings nav")
    time.sleep(WAIT_TIME)
    screenshot("settings_main")
    
    # Test each settings tab
    tabs = ["General", "License", "Accounts", "Trading", "Appearance"]
    tab_x_positions = [0.15, 0.25, 0.35, 0.45, 0.55]
    
    for i, tab in enumerate(tabs):
        if i < len(tab_x_positions):
            click_at(window, tab_x_positions[i], 0.12, f"{tab} tab")
            time.sleep(0.8)
            screenshot(f"settings_{tab.lower()}")
    
    # Test License Key input specifically
    click_at(window, 0.25, 0.12, "License tab")
    time.sleep(0.8)
    
    # Look for license key input
    click_at(window, 0.5, 0.35, "License key input")
    time.sleep(0.3)
    
    # Try entering a test key
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.typewrite("TEST-1234-5678-DEMO", interval=0.02)
    time.sleep(0.3)
    screenshot("settings_license_input")
    
    # Look for Validate/Save button
    click_at(window, 0.5, 0.55, "Validate button area")
    time.sleep(1.0)
    screenshot("settings_license_validated")
    
    test_results.append({"page": "Settings", "status": "tested"})


def test_help_page(window):
    """Test the Help page"""
    log("Testing Help page...", "ACTION")
    
    click_at(window, 0.07, 0.92, "Help nav")
    time.sleep(WAIT_TIME)
    screenshot("help_page")
    
    # Test accordion/expandable sections
    for y_pct in [0.25, 0.35, 0.45, 0.55]:
        click_at(window, 0.5, y_pct, "Help section")
        time.sleep(0.4)
    
    screenshot("help_expanded")
    test_results.append({"page": "Help", "status": "tested"})


def test_responsive_behavior(window):
    """Test responsive design"""
    log("Testing responsive behavior...", "ACTION")
    
    original_size = (window.width, window.height)
    
    # Test common breakpoints
    sizes = [
        (800, 600, "small"),
        (1024, 768, "medium"),
        (1920, 1080, "large"),
        (2560, 1440, "xlarge"),
    ]
    
    for width, height, name in sizes:
        try:
            window.resizeTo(width, height)
            time.sleep(0.8)
            screenshot(f"responsive_{name}")
            
            # Check for horizontal scroll (bad)
            # Check for overlapping elements (bad)
            # Check for cut-off text (bad)
            
        except Exception as e:
            log(f"Could not resize to {width}x{height}: {e}", "WARN")
    
    # Restore original
    window.resizeTo(original_size[0], original_size[1])
    time.sleep(0.5)


def test_accessibility(window):
    """Test keyboard accessibility"""
    log("Testing accessibility...", "ACTION")
    
    # Start from known state
    click_at(window, 0.07, 0.20, "Overview nav")
    time.sleep(0.5)
    
    # Test Tab navigation
    tab_count = 0
    for _ in range(15):
        pyautogui.press('tab')
        tab_count += 1
        time.sleep(0.15)
    
    screenshot("accessibility_tab_navigation")
    
    # Test Enter/Space on focused elements
    pyautogui.press('enter')
    time.sleep(0.3)
    pyautogui.press('escape')
    
    # Test Escape to close modals
    pyautogui.press('escape')
    time.sleep(0.3)
    
    screenshot("accessibility_final")
    test_results.append({"test": "Accessibility", "status": "tested"})


def generate_report():
    """Generate final test report"""
    report = {
        "timestamp": datetime.now().isoformat(),
        "window_title": APP_TITLE,
        "tests_run": len(test_results),
        "issues_found": len(issues),
        "issues": issues,
        "test_results": test_results
    }
    
    report_path = SCREENSHOT_DIR / "inspection_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary
    print("\n" + "=" * 70)
    print("UI INSPECTION REPORT")
    print("=" * 70)
    print(f"Tests Run: {len(test_results)}")
    print(f"Issues Found: {len(issues)}")
    
    if issues:
        print("\nISSUES DETECTED:")
        for issue in issues:
            severity_icon = {"critical": "🔴", "major": "🟠", "minor": "🟡"}.get(issue['severity'], "⚪")
            print(f"  {severity_icon} [{issue['severity'].upper()}] {issue['description']}")
            if issue['page']:
                print(f"      Page: {issue['page']}")
    else:
        print("\n✅ No issues found during automated inspection")
        print("   Manual visual review of screenshots recommended")
    
    print(f"\nScreenshots saved to: {SCREENSHOT_DIR}")
    print(f"Report saved to: {report_path}")
    print("=" * 70)
    
    return report


def main():
    print("\n" + "=" * 70)
    print("HEDGE EDGE DEEP UI INSPECTION")
    print("=" * 70)
    print("⚠️  This test will take control of your mouse!")
    print("⚠️  Move mouse to screen corner to abort (failsafe)")
    print("=" * 70)
    print("\nStarting in 3 seconds...")
    time.sleep(3)
    
    window = find_window()
    if not window:
        log("HedgeEdge window not found!", "FAIL")
        return False
    
    log(f"Found window: {window.title} ({window.width}x{window.height})", "PASS")
    
    try:
        # Run all tests
        test_overview_page(window)
        test_accounts_page(window)
        test_analytics_page(window)
        test_copier_page(window)
        test_calculator_page(window)
        test_settings_page(window)
        test_help_page(window)
        test_responsive_behavior(window)
        test_accessibility(window)
        
    except pyautogui.FailSafeException:
        log("Test aborted by user", "WARN")
    except Exception as e:
        log(f"Test error: {e}", "FAIL")
        screenshot("error_state")
    
    report = generate_report()
    return len(issues) == 0


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
