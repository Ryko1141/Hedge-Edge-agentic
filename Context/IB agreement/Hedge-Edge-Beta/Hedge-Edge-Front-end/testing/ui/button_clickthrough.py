import argparse
import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

try:
    from jira import JIRA  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    JIRA = None  # type: ignore

# Timing constants (milliseconds)
WAIT_CLICK_MS = 800
WAIT_DIALOG_MS = 1200

# Routes to exercise in order
ROUTES = [
    "/#/app/overview",
    "/#/app/accounts",
    "/#/app/analytics",
    "/#/app/copier",
    "/#/app/calculator",
    "/#/app/settings",
    "/#/app/help",
]

# Buttons to skip double-clicking (avoid destructive actions)
DESTRUCTIVE_WORDS = [
    "delete",
    "remove",
    "sign out",
    "logout",
    "log out",
    "unlink",
    "reset",
    "clear",
    "erase",
]

SAFE_DIALOG_CLOSE = ["close", "cancel", "dismiss", "got it", "ok", "done"]


def ts() -> str:
    return datetime.utcnow().isoformat()


def ensure_dirs(log_path: Path, screenshot_dir: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    screenshot_dir.mkdir(parents=True, exist_ok=True)


def write_log(log_path: Path, line: str) -> None:
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def is_safe_to_double(name: str) -> bool:
    lowered = name.lower()
    return not any(word in lowered for word in DESTRUCTIVE_WORDS)


def format_log(screen: str, button: str, action: str, observed: str, expected: str) -> str:
    return f"{ts()} | {screen} | {button} | {action} | {observed} | {expected}"


def build_jira_client() -> Optional[JIRA]:
    if JIRA is None:
        return None
    server = os.getenv("JIRA_SERVER")
    token = os.getenv("JIRA_TOKEN")
    user = os.getenv("JIRA_USER")
    if not (server and token and user):
        return None
    return JIRA(server=server, token_auth=token, basic_auth=None)


def file_jira_issue(client: JIRA, project_key: str, summary: str, description: str, labels: List[str], priority: str) -> None:
    if client is None:
        return
    client.create_issue(
        project=project_key,
        summary=summary,
        description=description,
        issuetype={"name": "Bug"},
        labels=labels,
        priority={"name": priority},
    )


async def close_open_dialogs(page) -> None:
    dialogs = page.locator('[role="dialog"], .radix-dialog-content')
    count = await dialogs.count()
    for i in range(count):
        container = dialogs.nth(i)
        close_btn = container.get_by_role("button", name=r"close|cancel|dismiss|got it|ok|done", exact=False)
        if await close_btn.count():
            try:
                await close_btn.first.click(timeout=1500)
            except PlaywrightTimeout:
                pass
        x_btn = container.locator('button:has-text("×"), button:has-text("✕")')
        if await x_btn.count():
            try:
                await x_btn.first.click(timeout=1500)
            except PlaywrightTimeout:
                pass


async def collect_buttons(page):
    buttons = await page.get_by_role("button").all()
    results = []
    for locator in buttons:
        if not await locator.is_visible():
            continue
        name = (await locator.inner_text()).strip()
        if not name:
            aria = await locator.get_attribute("aria-label")
            name = aria.strip() if aria else "<icon-button>"
        results.append({"locator": locator, "name": name})
    return results


async def click_button(page, locator, name: str, log_path: Path, screen: str, screenshot_dir: Path) -> None:
    try:
        await locator.scroll_into_view_if_needed(timeout=2000)
        await locator.hover(timeout=2000)
        await locator.click(timeout=3000)
        await page.wait_for_timeout(WAIT_CLICK_MS)
        write_log(log_path, format_log(screen, name, "click", "completed", "Button triggers expected action"))
        if is_safe_to_double(name):
            await locator.click(timeout=3000)
            await page.wait_for_timeout(WAIT_CLICK_MS)
            write_log(log_path, format_log(screen, name, "click-second", "completed", "Debounce check"))
    except PlaywrightTimeout as err:
        snap = screenshot_dir / f"{screen}-{name.replace(' ', '_')}-timeout.png"
        await page.screenshot(path=str(snap), full_page=True)
        write_log(log_path, format_log(screen, name, "click", f"timeout: {err}", "Button responds without hang"))
    except Exception as err:  # noqa: BLE001
        snap = screenshot_dir / f"{screen}-{name.replace(' ', '_')}-error.png"
        await page.screenshot(path=str(snap), full_page=True)
        write_log(log_path, format_log(screen, name, "click", f"error: {err}", "Button responds without error"))


async def exercise_route(page, route: str, screen: str, log_path: Path, screenshot_dir: Path) -> None:
    await page.goto(route, wait_until="networkidle")
    await page.wait_for_timeout(1200)
    buttons = await collect_buttons(page)
    for item in buttons:
        await click_button(page, item["locator"], item["name"], log_path, screen, screenshot_dir)
        await close_open_dialogs(page)
        await page.wait_for_timeout(WAIT_DIALOG_MS)


async def main() -> None:
    parser = argparse.ArgumentParser(description="UI click-through tester")
    parser.add_argument("--base-url", default="http://localhost:5173", help="Base URL where the app is running")
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode")
    parser.add_argument("--log-path", default="testing/ui/button_click_log.txt", help="Path for the text log")
    parser.add_argument("--screenshot-dir", default="testing/ui/screenshots", help="Folder for suspicious screenshots")
    parser.add_argument("--project-key", default=os.getenv("JIRA_PROJECT_KEY", ""), help="Jira project key for auto filing")
    parser.add_argument("--enable-jira", action="store_true", help="File Jira issues for errors if credentials are present")
    args = parser.parse_args()

    log_path = Path(args.log_path)
    screenshot_dir = Path(args.screenshot_dir)
    ensure_dirs(log_path, screenshot_dir)

    jira_client = build_jira_client() if args.enable_jira else None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=args.headless)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})

        suspicious: List[str] = []

        page.on("pageerror", lambda exc: suspicious.append(f"{ts()} | pageerror | {exc}"))
        page.on("console", lambda msg: suspicious.append(f"{ts()} | console.{msg.type} | {msg.text}"))
        page.on("requestfailed", lambda req: suspicious.append(f"{ts()} | requestfailed | {req.url} | {req.failure}"))

        for route in ROUTES:
            full_url = args.base_url.rstrip("/") + route
            write_log(log_path, format_log(route, "<route>", "navigate", "started", "Route loads"))
            await exercise_route(page, full_url, route, log_path, screenshot_dir)
            write_log(log_path, format_log(route, "<route>", "navigate", "done", "Route loads"))

        if suspicious:
            alert_path = log_path.parent / "suspicious.log"
            for entry in suspicious:
                write_log(alert_path, entry)
            if args.enable_jira and jira_client and args.project_key:
                summary = "[Button Click] Suspicious signals during clickthrough"
                description = "\n".join(suspicious)
                file_jira_issue(
                    jira_client,
                    args.project_key,
                    summary,
                    f"Observed during automated clickthrough:\n{description}",
                    labels=["ui-clickthrough", "button-coverage"],
                    priority="High",
                )

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
