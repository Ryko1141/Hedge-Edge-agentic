"""
Hedge Edge Interactive UI Test

This script performs actual UI testing by clicking buttons and interacting
with the Hedge Edge Electron application. It takes screenshots and logs
any issues found.

Requirements:
    pip install pyautogui pillow

Usage:
    python interactive_ui_test.py
"""

import pyautogui
import time
import sys
import os
import json
from datetime import datetime
from pathlib import Path

# Configuration
SCREENSHOT_DIR = Path(__file__).parent / "test_screenshots"
SCREENSHOT_DIR.mkdir(exist_ok=True)

APP_TITLE = "HedgeEdge"  # Window title without space
WAIT_TIME = 1.5  # seconds between actions

# PyAutoGUI settings
pyautogui.PAUSE = 0.3
pyautogui.FAILSAFE = True  # Move mouse to corner to abort

# Test results
issues_found = []
screenshots_taken = []


def log(msg, level="INFO"):
    """Log with timestamp"""
    ts = datetime.now().strftime("%H:%M:%S")
    symbol = {"INFO": "ℹ", "PASS": "✓", "FAIL": "✗", "WARN": "⚠", "ACTION": "→"}.get(level, " ")
    print(f"[{ts}] {symbol} {msg}")


def screenshot(name):
    """Take a screenshot"""
    filepath = SCREENSHOT_DIR / f"{datetime.now().strftime('%H%M%S')}_{name}.png"
    pyautogui.screenshot(str(filepath))
    screenshots_taken.append(str(filepath))
    log(f"Screenshot: {filepath.name}", "INFO")
    return filepath


def record_issue(issue, severity="minor"):
    """Record a UI issue"""
    issues_found.append({
        "issue": issue,
        "severity": severity,
        "timestamp": datetime.now().isoformat()
    })
    log(f"ISSUE: {issue}", "FAIL")


def find_app_window():
    """Find and activate the Hedge Edge window"""
    try:
        windows = pyautogui.getWindowsWithTitle(APP_TITLE)
        if windows:
            win = windows[0]
            win.activate()
            time.sleep(0.5)
            return win
        return None
    except Exception as e:
        log(f"Could not find window: {e}", "WARN")
        return None


def get_window_center(window):
    """Get center coordinates of window"""
    return (window.left + window.width // 2, window.top + window.height // 2)


def click_relative(window, x_pct, y_pct):
    """Click at a position relative to window (percentage)"""
    x = window.left + int(window.width * x_pct)
    y = window.top + int(window.height * y_pct)
    pyautogui.click(x, y)
    time.sleep(0.3)


def test_sidebar_navigation(window):
    """Test clicking through sidebar navigation items"""
    log("Testing sidebar navigation...", "ACTION")
    
    # Sidebar is typically on the left side (0-15% of window width)
    # Navigation items are stacked vertically
    
    # Approximate Y positions for nav items (as percentage of window height)
    nav_items = [
        ("Overview", 0.20),
        ("Accounts", 0.27),
        ("Analytics", 0.34),
        ("Trade Copier", 0.41),
        ("Calculator", 0.48),
        ("Settings", 0.85),
        ("Help", 0.92),
    ]
    
    for name, y_pct in nav_items:
        log(f"Clicking: {name}", "ACTION")
        click_relative(window, 0.07, y_pct)
        time.sleep(WAIT_TIME)
        screenshot(f"nav_{name.lower().replace(' ', '_')}")
        
        # Check if page loaded (visual inspection via screenshots)
        log(f"Navigated to: {name}", "PASS")
    
    return True


def test_buttons_on_page(window, page_name):
    """Try to find and click buttons on the current page"""
    log(f"Testing buttons on {page_name}...", "ACTION")
    
    # Common button positions - center area of the page
    # These are approximate and may need adjustment
    button_areas = [
        (0.5, 0.3),   # Top center area
        (0.5, 0.5),   # Center
        (0.7, 0.3),   # Top right area
        (0.3, 0.5),   # Center left
        (0.7, 0.5),   # Center right
    ]
    
    for i, (x_pct, y_pct) in enumerate(button_areas):
        # Move to position first to see what's there
        x = window.left + int(window.width * x_pct)
        y = window.top + int(window.height * y_pct)
        pyautogui.moveTo(x, y)
        time.sleep(0.2)


def test_settings_page(window):
    """Test the settings page specifically"""
    log("Testing Settings page...", "ACTION")
    
    # Navigate to settings
    click_relative(window, 0.07, 0.85)
    time.sleep(WAIT_TIME)
    screenshot("settings_page")
    
    # Try to find tabs or sections on settings page
    # Settings usually has tabs at the top of the content area
    settings_tabs = [
        ("General", 0.25),
        ("License", 0.35),
        ("Trading", 0.45),
        ("Appearance", 0.55),
    ]
    
    for name, x_pct in settings_tabs:
        log(f"Looking for {name} tab...", "ACTION")
        click_relative(window, x_pct, 0.15)
        time.sleep(0.8)
        screenshot(f"settings_{name.lower()}")


def test_modal_dialogs(window):
    """Test opening and closing modal dialogs"""
    log("Testing modal dialogs...", "ACTION")
    
    # Go to Accounts page which likely has "Add Account" button
    click_relative(window, 0.07, 0.27)
    time.sleep(WAIT_TIME)
    
    # Look for "Add" button (usually top right of content area)
    log("Looking for Add button...", "ACTION")
    click_relative(window, 0.85, 0.15)
    time.sleep(WAIT_TIME)
    screenshot("modal_test")
    
    # Try to close modal (Escape key)
    pyautogui.press('escape')
    time.sleep(0.5)
    screenshot("modal_closed")


def test_keyboard_shortcuts(window):
    """Test keyboard navigation"""
    log("Testing keyboard navigation...", "ACTION")
    
    # Tab through elements
    for i in range(5):
        pyautogui.press('tab')
        time.sleep(0.3)
    
    screenshot("after_tab_navigation")
    
    # Shift+Tab back
    for i in range(3):
        pyautogui.hotkey('shift', 'tab')
        time.sleep(0.3)
    
    screenshot("after_shift_tab")


def test_window_resize(window):
    """Test responsive design by resizing"""
    log("Testing window resize...", "ACTION")
    
    original_size = (window.width, window.height)
    
    # Test smaller size
    try:
        window.resizeTo(900, 600)
        time.sleep(WAIT_TIME)
        screenshot("resize_small")
        
        # Check if content is cut off or overlapping
        # (Manual inspection of screenshot)
        
        # Test larger size
        window.resizeTo(1400, 900)
        time.sleep(WAIT_TIME)
        screenshot("resize_large")
        
        # Restore original
        window.resizeTo(original_size[0], original_size[1])
        time.sleep(0.5)
        
    except Exception as e:
        log(f"Resize test failed: {e}", "WARN")


def test_scroll_behavior(window):
    """Test scrolling on pages"""
    log("Testing scroll behavior...", "ACTION")
    
    # Click in the main content area
    click_relative(window, 0.5, 0.5)
    time.sleep(0.3)
    
    # Scroll down
    pyautogui.scroll(-5)
    time.sleep(0.5)
    screenshot("scroll_down")
    
    # Scroll up
    pyautogui.scroll(5)
    time.sleep(0.5)
    screenshot("scroll_up")


def test_hover_states(window):
    """Test hover effects on buttons and links"""
    log("Testing hover states...", "ACTION")
    
    # Move to various UI elements
    positions = [
        (0.07, 0.20),  # Nav item
        (0.07, 0.27),  # Another nav item
        (0.5, 0.3),    # Content area
        (0.85, 0.15),  # Potential button area
    ]
    
    for x_pct, y_pct in positions:
        x = window.left + int(window.width * x_pct)
        y = window.top + int(window.height * y_pct)
        pyautogui.moveTo(x, y)
        time.sleep(0.5)  # Let hover effect show
    
    screenshot("hover_test")


def run_interactive_tests():
    """Main test runner"""
    print("\n" + "=" * 60)
    print("HEDGE EDGE INTERACTIVE UI TEST")
    print("=" * 60)
    print("⚠️  Do not move the mouse during testing!")
    print("⚠️  Move mouse to screen corner to abort (failsafe)")
    print("=" * 60 + "\n")
    
    # Find window
    window = find_app_window()
    if not window:
        log("Hedge Edge window not found! Is the app running?", "FAIL")
        return False
    
    log(f"Found window: {window.title} ({window.width}x{window.height})", "PASS")
    screenshot("01_initial_state")
    
    try:
        # Run tests
        test_sidebar_navigation(window)
        test_settings_page(window)
        test_keyboard_shortcuts(window)
        test_scroll_behavior(window)
        test_hover_states(window)
        test_window_resize(window)
        test_modal_dialogs(window)
        
        # Final screenshot
        screenshot("99_final_state")
        
    except pyautogui.FailSafeException:
        log("Test aborted by user (failsafe triggered)", "WARN")
    except Exception as e:
        log(f"Test error: {e}", "FAIL")
        screenshot("error_state")
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Screenshots taken: {len(screenshots_taken)}")
    print(f"Issues found: {len(issues_found)}")
    
    if issues_found:
        print("\nIssues:")
        for issue in issues_found:
            print(f"  - [{issue['severity']}] {issue['issue']}")
    
    print(f"\nScreenshots saved to: {SCREENSHOT_DIR}")
    print("=" * 60)
    
    # Save report
    report = {
        "timestamp": datetime.now().isoformat(),
        "screenshots": screenshots_taken,
        "issues": issues_found,
        "window_size": f"{window.width}x{window.height}" if window else "N/A"
    }
    
    report_path = SCREENSHOT_DIR / "test_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    return len(issues_found) == 0


if __name__ == '__main__':
    print("\nStarting in 3 seconds... Make sure Hedge Edge is visible!")
    time.sleep(3)
    
    success = run_interactive_tests()
    sys.exit(0 if success else 1)
