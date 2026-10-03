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

  /** Paraphrase finding details so static crawlers / noscript stay clean. */
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
    return "Honesty risk flagged (see report details for the match)";
  }

  function humanCategory(finding) {
    const cat = String(finding.category || "").toLowerCase();
    if (cat.includes("money") || cat.includes("claim")) return "Risky claim";
    if (cat.includes("denial")) return "Check this denial";
    if (cat.includes("independence")) return "Check this link";
    return "Needs a look";
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
      badge.textContent = isClean ? "Clean" : "Needs fix";
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Clean — nothing risky flagged. A person should still review before publish."
        : "Blocked — risky claim shapes caught. Do not publish as-is.";
    }

    if (meta) {
      const n = Number(report.risk_count) || 0;
      meta.textContent = isClean
        ? "Sample page with careful wording. Nothing risky flagged."
        : `Sample page written on purpose with overconfident claim shapes${n ? ` (${n} flags)` : ""}.`;
    }

    if (findings) {
      const list = Array.isArray(report.findings) ? report.findings : [];
      if (!list.length) {
        findings.innerHTML =
          `<p class="empty">No issues found. Still have a person read it before it goes live.</p>`;
      } else {
        findings.innerHTML = `<ul class="findings">${list
          .map(
            (f) => `<li>
              <span class="cat">${escapeHtml(humanCategory(f))}</span>
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
      if (v) v.textContent = "Demo files unavailable — open the report details below.";
    }
    if (fail) {
      const v = fail.querySelector("[data-verdict]");
      if (v) v.textContent = "Demo files unavailable — open the report details below.";
    }
  });
})();
