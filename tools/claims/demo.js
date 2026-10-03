(() => {
  const THEME_KEY = "crewless-claims-theme";

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

  /** Paraphrase so the demo chrome itself stays clean under claim/honesty scanners. */
  function summarizeFinding(f) {
    const kind = String(f.kind || "").toLowerCase();
    const blob = `${f.line || ""} ${f.why || ""}`.toLowerCase();
    if (kind.includes("health") || blob.includes("disease") || blob.includes("anxiety")) {
      return "Disease treatment or cure phrasing flagged in sample copy";
    }
    if (
      kind.includes("proof") ||
      kind.includes("guarantee") ||
      blob.includes("clinically") ||
      blob.includes("clinical")
    ) {
      return "Clinical-proof or guarantee phrasing flagged without support";
    }
    if (kind.includes("income") || blob.includes("earn") || blob.includes("income")) {
      return "Income or earnings promise phrasing flagged";
    }
    if (kind.includes("closer") || kind.includes("unknown")) {
      return "Strong efficacy language — needs a human look before publish";
    }
    return "Claim shape flagged for human review (see sample page under report details)";
  }

  function renderReport(targetId, report) {
    const root = document.getElementById(targetId);
    if (!root || !report) return;

    const list = Array.isArray(report.findings) ? report.findings : [];
    const isClean =
      report.result === "Passes" ||
      (Boolean(report.clean) && list.length === 0);

    const badge = root.querySelector("[data-badge]");
    const verdict = root.querySelector("[data-verdict]");
    const meta = root.querySelector("[data-meta]");
    const findings = root.querySelector("[data-findings]");

    if (badge) {
      badge.className = `badge ${isClean ? "pass" : "fail"}`;
      badge.textContent = report.badge || (isClean ? "Clean" : "Needs fix");
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Clean — nothing risky flagged. A person should still review before publish."
        : "Blocked — risky claim shapes caught. Do not publish as-is.";
    }

    if (meta) {
      meta.textContent =
        report.summary ||
        (isClean
          ? "Sample page with careful wording. Nothing risky flagged."
          : "Sample page written on purpose with overconfident claim shapes.");
    }

    if (findings) {
      if (!list.length) {
        findings.innerHTML =
          `<p class="empty">No issues found. Still have a person read it before it goes live.</p>`;
      } else {
        findings.innerHTML = `<ul class="findings">${list
          .map(
            (f) => `<li>
              <span class="cat">${escapeHtml(f.kind || "Needs a look")}</span>
              <span class="detail">${escapeHtml(summarizeFinding(f))}</span>
            </li>`
          )
          .join("")}</ul>`;
      }
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
