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
    "/sv/whats-real/",
    "/method-pack/",
    "/sv/method-pack/",
    "/tools/honesty/",
    "/tools/claims/",
    "/tools/shipping-gates/",
    "/sv/tools/honesty/",
    "/sv/tools/claims/",
    "/sv/tools/shipping-gates/",
    "/brief/",
    "/sv/brief/",
    "/brief/we-put-a-doorbell-on-the-method-pack/",
    "/brief/coffee-through-2029-under-claim/",
    "/brief/the-trust-layer-is-the-product/",
    "/brief/what-an-agent-run-company-looks-like-before-the-proof/",
    "/brief/which-review-sources-can-you-trust/",
    "/brief/why-we-wont-promise-an-algorithm/",
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
        "/sv/whats-real/",
        "/method-pack/",
        "/sv/method-pack/",
        "/brief/",
        "/sv/brief/",
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
    if path in ("/", "/sv/", "/whats-real/", "/sv/whats-real/"):
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
    if not (
        re.search(r"<h2>\s*Passes\s*</h2>", html)
        or re.search(r"<h2>\s*Godkänd\s*</h2>", html)
    ):
        fails.append(f"P0 {label} missing Passes/Godkänd column")
    if not (
        re.search(r"<h2>\s*Blocked\s*</h2>", html)
        or re.search(r"<h2>\s*Stoppad\s*</h2>", html)
    ):
        fails.append(f"P0 {label} missing Blocked/Stoppad column")
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
        "/sv/whats-real/": "sv/whats-real/index.html",
        "/method-pack/": "method-pack/index.html",
        "/sv/method-pack/": "sv/method-pack/index.html",
        "/tools/honesty/": "tools/honesty/index.html",
        "/tools/claims/": "tools/claims/index.html",
        "/tools/shipping-gates/": "tools/shipping-gates/index.html",
        "/sv/tools/honesty/": "sv/tools/honesty/index.html",
        "/sv/tools/claims/": "sv/tools/claims/index.html",
        "/sv/tools/shipping-gates/": "sv/tools/shipping-gates/index.html",
        "/brief/": "brief/index.html",
        "/sv/brief/": "sv/brief/index.html",
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
        if path in ("/tools/honesty/", "/sv/tools/honesty/"):
            check_honesty(html, fails, path.strip("/").replace("/", "-") or "honesty")
        if path in ("/tools/claims/", "/sv/tools/claims/"):
            check_honesty(html, fails, path.strip("/").replace("/", "-") or "claims")
        if path in ("/tools/shipping-gates/", "/sv/tools/shipping-gates/"):
            check_honesty(html, fails, path.strip("/").replace("/", "-") or "shipping-gates")


    # SV chrome must not dump "Rapporter" into English /brief/
    for path in ("/sv/", "/sv/whats-real/", "/sv/brief/"):
        html = local_html.get(path, "")
        if not html:
            continue
        if 'href="/brief/">Rapporter</a>' in html:
            fails.append(f"P0 SV nav {path}: Rapporter still points at EN /brief/")
        # SV demos must stay on /sv/tools/* (not EN dump)
        if path in ("/sv/", "/sv/whats-real/"):
            if 'href="/tools/honesty/"' in html or 'href="/tools/claims/"' in html or 'href="/tools/shipping-gates/"' in html:
                fails.append(f"P0 SV {path}: demo links still dump into EN /tools/*")
            if "/sv/tools/honesty/" not in html:
                fails.append(f"P0 SV {path}: missing /sv/tools/honesty/ twin link")
        if path == "/sv/brief/":
            if "Korta anteckningar" not in html:
                fails.append("P0 /sv/brief/ missing Swedish H1 kick")
            if "På engelska" not in html:
                fails.append("P0 /sv/brief/ missing honest EN-article tags")
            if "handelsbot" not in html.lower():
                fails.append("P0 /sv/brief/ missing not-a-trading-bot line")

    # EN brief articles must offer SV escape (catalog stays EN-content + På engelska)
    article_dirs = sorted((root / "brief").glob("*/index.html")) if (root / "brief").exists() else []
    for ap in article_dirs:
        html = ap.read_text(encoding="utf-8", errors="replace")
        rel = ap.relative_to(root).as_posix()
        if 'href="/sv/brief/"' not in html:
            fails.append(f"P0 {rel}: missing SV escape to /sv/brief/")
        if "Tillbaka till svenska rapporter" not in html and "Svenska rapporter" not in html:
            fails.append(f"P0 {rel}: missing Svenska rapporter label")
        if 'hreflang="sv"' not in html:
            fails.append(f"P0 {rel}: missing hreflang sv → /sv/brief/")

    # Home EN+SV must advertise language alternates (shopfront hreflang)
    for path, need_sv in (("/", True), ("/sv/", True)):
        html = local_html.get(path, "")
        if not html:
            continue
        if 'hreflang="en"' not in html or 'hreflang="sv"' not in html:
            fails.append(f"P0 {path}: missing home hreflang en/sv")
        if 'https://crewless.se/sv/' not in html:
            fails.append(f"P0 {path}: missing absolute SV home alternate")

    # Stranger-facing 404 page (Workers not_found_handling = 404-page)
    four = root / "404.html"
    if not four.exists():
        fails.append("P0 missing 404.html stranger pass page")
    else:
        html404 = four.read_text(encoding="utf-8", errors="replace")
        for needle in (
            "This page isn’t here.",
            "Den här sidan finns inte.",
            'href="/"',
            'href="/method-pack/"',
            'href="/#contact"',
            'href="/sv/"',
            'href="/sv/method-pack/"',
            'href="/sv/#contact"',
            "Not a trading bot",
        ):
            if needle not in html404:
                fails.append(f"P0 404.html missing {needle!r}")
        for bad in ("dogfood", "SKU", "fail-closed", "scanner", "cups"):
            if bad.lower() in strip_tags(html404).lower():
                fails.append(f"P0 404.html jargon: {bad!r}")
    wrangler = root / "wrangler.toml"
    if wrangler.exists():
        wt = wrangler.read_text(encoding="utf-8", errors="replace")
        if 'not_found_handling' not in wt or "404-page" not in wt:
            fails.append("P0 wrangler.toml missing assets.not_found_handling = 404-page")

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
                "/sv/whats-real/",
                "/method-pack/",
                "/sv/method-pack/",
                "/brief/",
                "/sv/brief/",
                "/tools/honesty/",
                "/tools/claims/",
                "/tools/shipping-gates/",
                "/sv/tools/honesty/",
                "/sv/tools/claims/",
                "/sv/tools/shipping-gates/",
            ):
                check_atf_jargon(route, body, fails)
            if route == "/":
                check_home(body, fails, notes)
                home_ids = ids_in(body)
            if route in ("/tools/honesty/", "/sv/tools/honesty/"):
                check_honesty(body, fails, route)
            if route in ("/tools/claims/", "/sv/tools/claims/"):
                check_honesty(body, fails, route)
            if route in ("/tools/shipping-gates/", "/sv/tools/shipping-gates/"):
                check_honesty(body, fails, route)
            if route == "/sv/":
                if 'href="/tools/honesty/"' in body:
                    fails.append("P0 live /sv/ still dumps demos to EN /tools/*")
                if "Ärlighetskoll" in body and "/sv/tools/honesty/" not in body:
                    fails.append("P0 live /sv/ missing SV honesty twin")
            if route.startswith("/sv/tools/") and route.endswith("/"):
                if 'href="/">' in body and 'href="/sv/">' not in body:
                    fails.append(f"P0 live {route} Home dumps to EN /")
                if 'lang-switch' not in body and 'Read in English' not in body:
                    fails.append(f"P0 live {route} missing EN switcher")
            if route.startswith("/brief/") and route.count("/") >= 3:
                if 'href="/sv/brief/"' not in body:
                    fails.append(f"P0 live {route}: EN article dumps SV visitors (no /sv/brief/ escape)")
                if "Svenska rapporter" not in body:
                    fails.append(f"P0 live {route}: missing Svenska rapporter escape label")
            if route in ("/", "/sv/"):
                if 'hreflang="en"' not in body or 'hreflang="sv"' not in body:
                    fails.append(f"P0 live {route}: missing home hreflang en/sv")
        # Live 404 must be HTTP 404 with stranger HTML (not blank null-body)
        miss = urljoin(args.base + "/", "/does-not-exist-stranger-test-xyz/")
        code404, body404 = fetch_live(miss)
        if code404 != 404:
            fails.append(f"P0 live missing-URL expected HTTP 404, got {code404}")
        elif not body404 or "This page isn’t here." not in body404:
            fails.append("P0 live 404 is blank or missing stranger pass copy")
        elif 'href="/method-pack/"' not in body404 or 'href="/#contact"' not in body404:
            fails.append("P0 live 404 missing Home/Pack/Write escapes")
        else:
            print(f"  {code404} /does-not-exist-stranger-test-xyz/ (stranger 404 OK)")
        # security.txt alias
        csec, _ = fetch_live(urljoin(args.base + "/", "/security.txt"))
        if csec not in (200, 301, 302):
            # follow already in fetch_live; accept 200 after redirect
            fails.append(f"P0 live /security.txt HTTP {csec}")
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
