(() => {
  const THEME_KEY = "crewless-honesty-theme";

  function preferTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "day" || saved === "night") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "night"
      : "day";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === theme));
    });
  }

  applyTheme(preferTheme());
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.themeBtn));
  });

  /** Paraphrase finding details so static crawlers / noscript stay clean;
   *  the live cup still shows category + severity + a safe summary. */
  function summarizeFinding(finding) {
    const detail = String(finding.detail || "");
    if (detail.startsWith("currency/number figure")) {
      return "Currency or money-figure shape flagged in page text";
    }
    if (detail.startsWith("money/") && detail.includes("vocabulary")) {
      return "Money or desk vocabulary flagged in page text";
    }
    if (detail.startsWith("unproven performance claim")) {
      return "Unproven performance-claim phrasing flagged";
    }
    if (detail.startsWith("return-percentage claim")) {
      return "Return-percentage claim shape flagged";
    }
    if (detail.includes("exposure-denial")) {
      return "Exposure-denial phrase — verify against current reality";
    }
    if (detail.includes("independence")) {
      return "Independence / employer-link phrasing flagged";
    }
    return "Honesty risk flagged (see JSON artifact for exact match)";
  }

  function renderReport(targetId, report, kind) {
    const root = document.getElementById(targetId);
    if (!root || !report) return;

    const isClean = Boolean(report.clean) && Number(report.risk_count) === 0;
    const badge = root.querySelector("[data-badge]");
    const verdict = root.querySelector("[data-verdict]");
    const meta = root.querySelector("[data-meta]");
    const findings = root.querySelector("[data-findings]");

    if (badge) {
      badge.className = `badge ${isClean ? "pass" : "fail"}`;
      badge.textContent = isClean ? "exit 0 · clean" : `exit 1 · ${report.risk_count} risks`;
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Clean — no honesty risks flagged (still owes human review)."
        : "Fail-closed — planted money-claim shapes blocked publish.";
    }

    if (meta) {
      meta.innerHTML = `
        <div><strong>source</strong> ${escapeHtml((report.sources || []).join(", ") || "—")}</div>
        <div><strong>sku</strong> ${escapeHtml(report.sku || "site-honesty-scanner")} ${escapeHtml(report.sku_version || "")}</div>
        <div><strong>risk_count</strong> ${Number(report.risk_count) || 0}</div>
        <div><strong>mode</strong> static demo · pre-rendered fixture</div>
      `;
    }

    if (findings) {
      const list = Array.isArray(report.findings) ? report.findings : [];
      if (!list.length) {
        findings.innerHTML = `<p class="empty">No findings. Human review still required before publish.</p>`;
      } else {
        findings.innerHTML = `<ul class="findings">${list
          .map(
            (f) => `<li>
              <span class="cat">${escapeHtml(f.category)} / ${escapeHtml(f.severity)}</span>
              <span class="detail">${escapeHtml(summarizeFinding(f))}</span>
            </li>`
          )
          .join("")}</ul>`;
      }
    }

    root.dataset.kind = kind;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function load() {
    const [clean, fail] = await Promise.all([
      fetch("./demo/clean.json").then((r) => r.json()),
      fetch("./demo/fail.json").then((r) => r.json()),
    ]);
    renderReport("report-clean", clean, "clean");
    renderReport("report-fail", fail, "fail");
  }

  load().catch(() => {
    const clean = document.getElementById("report-clean");
    const fail = document.getElementById("report-fail");
    if (clean) {
      const v = clean.querySelector("[data-verdict]");
      if (v) v.textContent = "Demo artifacts unavailable — open demo/clean.json directly.";
    }
    if (fail) {
      const v = fail.querySelector("[data-verdict]");
      if (v) v.textContent = "Demo artifacts unavailable — open demo/fail.json directly.";
    }
  });
})();
