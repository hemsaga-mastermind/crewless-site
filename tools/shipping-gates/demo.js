(() => {
  const THEME_KEY = "crewless-shipping-gates-theme";

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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList(items, emptyHtml) {
    if (!items.length) return emptyHtml;
    return `<ul class="findings">${items
      .map(
        (item) => `<li>
          <span class="cat">${escapeHtml(item.kind || "Needs a look")}</span>
          <span class="detail">${escapeHtml(item.detail || "")}</span>
        </li>`
      )
      .join("")}</ul>`;
  }

  function renderReport(targetId, report) {
    const root = document.getElementById(targetId);
    if (!root || !report) return;

    const isClean =
      report.result === "Passes" ||
      (Boolean(report.clean) &&
        (!Array.isArray(report.findings) || report.findings.length === 0));

    const badge = root.querySelector("[data-badge]");
    const verdict = root.querySelector("[data-verdict]");
    const meta = root.querySelector("[data-meta]");
    const checks = root.querySelector("[data-checks]");
    const findings = root.querySelector("[data-findings]");

    if (badge) {
      badge.className = `badge ${isClean ? "pass" : "fail"}`;
      badge.textContent = report.badge || (isClean ? "Clean" : "Needs fix");
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Clean — gate open. A person should still review before publish."
        : "Blocked — do not ship as-is.";
    }

    if (meta) {
      meta.textContent =
        report.summary ||
        (isClean
          ? "Sample change with careful page wording, an independent reviewer mark, and a kill line."
          : "Sample change written on purpose with risky page wording, no reviewer mark, and no kill line.");
    }

    if (checks && Array.isArray(report.checks)) {
      checks.innerHTML = renderList(
        report.checks.map((c) => ({
          kind: c.kind,
          detail: c.detail,
        })),
        `<p class="empty">No gate checks listed.</p>`
      );
    }

    if (findings) {
      const list = Array.isArray(report.findings) ? report.findings : [];
      findings.innerHTML = renderList(
        list,
        `<p class="empty">No blocks. Still have a person read it before it goes live.</p>`
      );
    }
  }

  async function load() {
    const [clean, fail] = await Promise.all([
      fetch("./demo/clean.json").then((r) => r.json()),
      fetch("./demo/fail.json").then((r) => r.json()),
    ]);
    renderReport("report-clean", clean);
    renderReport("report-fail", fail);
  }

  load().catch(() => {
    /* Static HTML fallback already in the page */
  });
})();
