#!/usr/bin/env python3
"""Static stranger-hat checks for crewless-site (local files and/or live CDN).

  python3 tools/stranger_hat_check.py
  python3 tools/stranger_hat_check.py --live
  python3 tools/stranger_hat_check.py --root .

Exits 0 when no P0 fails. Does not replace the human hat in
docs/crewless-site-stranger-hat-qa.md — only automates jargon/anchors/links.
"""
from __future__ import annotations

import argparse
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

ATF_BANNED = [
    "dogfood",
    "SKU",
    "scanner",
    "cups",
    "fail-closed",
    "on-ramp",
    "Method Pack",
]
# Nav/taxonomy words that must not appear as chrome labels on home ATF
ATF_NAV_BANNED = ["Building", "Progress"]

KEY_ROUTES = [
    "/",
    "/sv/",
    "/whats-real/",
    "/method-pack/",
    "/tools/honesty/",
    "/tools/claims/",
    "/tools/shipping-gates/",
    "/brief/",
    "/brief/we-put-a-doorbell-on-the-method-pack/",
    "/llms.txt",
    "/state.json",
]

HOME_REQUIRED_IDS = ["now", "next", "write", "contact", "building"]


def strip_tags(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def first_scroll_chunk(html: str) -> str:
    body_m = re.search(r"<body[^>]*>([\s\S]*)", html, re.I)
    body = body_m.group(1) if body_m else html
    for cut in (
        'id="real"',
        'id="shape"',
        'id="idea"',
        'id="brain"',
        'class="demo-stage"',
        'id="form"',
        'class="artwrap"',
    ):
        i = body.find(cut)
        if i > 400:
            body = body[:i]
            break
    return body


def fetch_live(url: str, insecure: bool = False) -> tuple[int | None, str]:
    # Prefer curl — Python SSL on some Macs lacks the system trust store.
    try:
        p = subprocess.run(
            ["curl", "-sS", "-L", "-w", "\n%{http_code}", "-H", "Cache-Control: no-cache", url],
            capture_output=True,
            text=True,
            timeout=45,
        )
        if p.returncode == 0 and p.stdout:
            body, _, code = p.stdout.rpartition("\n")
            return int(code), body
    except Exception:
        pass
    ctx = ssl._create_unverified_context() if insecure else None
    req = urllib.request.Request(url, headers={"User-Agent": "crewless-stranger-hat-check/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=45) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)


def read_local(root: Path, path: str) -> str:
    rel = path.lstrip("/")
    if not rel or rel.endswith("/"):
        candidate = root / rel / "index.html"
    else:
        candidate = root / rel
    if not candidate.exists() and (root / rel / "index.html").exists():
        candidate = root / rel / "index.html"
    return candidate.read_text(encoding="utf-8", errors="replace")


def ids_in(html: str) -> set[str]:
    return set(re.findall(r'\bid=["\']([^"\']+)["\']', html))


def check_atf_jargon(path: str, html: str, fails: list[str]) -> None:
    if path not in (
        "/",
        "/sv/",
        "/whats-real/",
        "/method-pack/",
        "/tools/honesty/",
        "/tools/claims/",
        "/tools/shipping-gates/",
    ):
        return
    chunk = first_scroll_chunk(html)
    text = strip_tags(chunk)
    for word in ATF_BANNED:
        if word.lower() in text.lower():
            # Honesty may say "passes/blocked" — scanner banned; Method Pack banned on shopfront.
            fails.append(f"P0 jargon ATF {path}: {word!r}")
    if path in ("/", "/sv/", "/whats-real/"):
        for word in ATF_NAV_BANNED:
            nav = re.search(r"<nav[^>]*>(.*?)</nav>", html, re.I | re.S)
            nav_t = strip_tags(nav.group(1)) if nav else ""
            if re.search(rf"\b{word}\b", nav_t):
                fails.append(f"P0 nav label {path}: {word!r}")


def check_home(html: str, fails: list[str], notes: list[str]) -> None:
    ids = ids_in(html)
    for i in HOME_REQUIRED_IDS:
        if i not in ids:
            fails.append(f"P0 missing id #{i} on /")
    nav = re.search(r"<nav[^>]*>(.*?)</nav>", html, re.I | re.S)
    nav_t = strip_tags(nav.group(1)) if nav else ""
    en_ok = "Pack" in nav_t and "Contact" in nav_t
    sv_ok = "Paket" in nav_t and "Kontakt" in nav_t
    if not (en_ok or sv_ok):
        fails.append(f"P0 home nav missing expected labels (have: {nav_t!r})")
    if 'id="contact"' in html and "Write to us" not in html and "Skriv till oss" not in html:
        fails.append("P0 #contact missing Write to us / Skriv till oss kick")
    if "scroll-margin" not in html and "scroll-padding-top" not in html:
        fails.append("P0 sticky scroll offset missing on /")
    if "Passes" in html:
        notes.append("home mentions Passes (unexpected)")
    # wrong-section: if present and not hidden with empty list — soft
    if 'id="wrong"' in html:
        notes.append("#wrong present (JS fills ≤3 from state.mistakes)")


def check_honesty(html: str, fails: list[str], label: str = "honesty") -> None:
    if not re.search(r"<h2>\s*Passes\s*</h2>", html):
        fails.append(f"P0 {label} missing Passes column")
    if not re.search(r"<h2>\s*Blocked\s*</h2>", html):
        fails.append(f"P0 {label} missing Blocked column")
    atf = strip_tags(first_scroll_chunk(html))
    for bad in ("sku", "risk_count", "exit"):
        if bad in atf.lower():
            fails.append(f"P0 {label} ATF engineer term: {bad}")


def check_hashes(path: str, html: str, home_ids: set[str], fails: list[str]) -> None:
    local_ids = ids_in(html)
    for frag in re.findall(r'href=["\'](#[^"\']+)["\']', html):
        fid = frag[1:]
        if fid not in local_ids:
            fails.append(f"P0 dead in-page hash {path} {frag}")
    for href in re.findall(r'href=["\']([^"\']+)["\']', html):
        if href.startswith("/#") or href.startswith("https://crewless.se/#"):
            frag = href.split("#", 1)[1]
            if home_ids and frag not in home_ids:
                fails.append(f"P0 dead home hash from {path}: {href}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--live", action="store_true", help="Also probe https://crewless.se")
    ap.add_argument("--base", default="https://crewless.se")
    args = ap.parse_args()
    root: Path = args.root
    fails: list[str] = []
    notes: list[str] = []

    pages = {
        "/": "index.html",
        "/sv/": "sv/index.html",
        "/whats-real/": "whats-real/index.html",
        "/method-pack/": "method-pack/index.html",
        "/tools/honesty/": "tools/honesty/index.html",
        "/tools/claims/": "tools/claims/index.html",
        "/tools/shipping-gates/": "tools/shipping-gates/index.html",
        "/brief/": "brief/index.html",
    }

    local_html = {}
    for path, rel in pages.items():
        p = root / rel
        if not p.exists():
            fails.append(f"P0 missing file {rel}")
            continue
        local_html[path] = p.read_text(encoding="utf-8", errors="replace")

    home_ids = ids_in(local_html.get("/", ""))
    for path, html in local_html.items():
        check_atf_jargon(path, html, fails)
        check_hashes(path, html, home_ids, fails)
        if path == "/":
            check_home(html, fails, notes)
        if path == "/tools/honesty/":
            check_honesty(html, fails, "honesty")
        if path == "/tools/claims/":
            check_honesty(html, fails, "claims")
        if path == "/tools/shipping-gates/":
            check_honesty(html, fails, "shipping-gates")

    if args.live:
        print(f"Live probe {args.base} …")
        for route in KEY_ROUTES:
            code, body = fetch_live(urljoin(args.base, route))
            if code != 200:
                fails.append(f"P0 live HTTP {code} {route}")
                continue
            print(f"  {code} {route}")
            if route in (
                "/",
                "/sv/",
                "/whats-real/",
                "/method-pack/",
                "/tools/honesty/",
                "/tools/claims/",
                "/tools/shipping-gates/",
            ):
                check_atf_jargon(route, body, fails)
            if route == "/":
                check_home(body, fails, notes)
                home_ids = ids_in(body)
            if route == "/tools/honesty/":
                check_honesty(body, fails, "honesty")
            if route == "/tools/claims/":
                check_honesty(body, fails, "claims")
            if route == "/tools/shipping-gates/":
                check_honesty(body, fails, "shipping-gates")
        # quick link sample from home
        code, home = fetch_live(args.base + "/")
        if code == 200:
            hrefs = set()
            for h in re.findall(r'href=["\']([^"\'#]+)["\']', home):
                if h.startswith(("mailto:", "tel:", "javascript:")):
                    continue
                url = urljoin(args.base + "/", h).split("#")[0]
                if urlparse(url).netloc and "crewless.se" not in urlparse(url).netloc:
                    continue
                hrefs.add(url)
            for url in sorted(hrefs):
                c, _ = fetch_live(url)
                if c != 200:
                    fails.append(f"P0 live link {c} {url}")

    print("\n=== stranger_hat_check ===")
    if notes:
        print("Notes:")
        for n in notes:
            print(" -", n)
    if fails:
        # de-dupe preserve order
        seen = set()
        uniq = []
        for f in fails:
            if f not in seen:
                seen.add(f)
                uniq.append(f)
        print(f"FAIL ({len(uniq)}):")
        for f in uniq:
            print(" -", f)
        return 1
    print("PASS — no automated P0 fails")
    return 0


if __name__ == "__main__":
    sys.exit(main())
