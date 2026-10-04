(() => {
  const THEME_KEY = "crewless-shipping-gates-theme";
  const SAMPLE_KEY = "crewless-shipping-gates-blocked-sample";

  const BLOCKED_SAMPLES = {
    wording: {
      label: "Wording",
      json: "./demo/fail_wording.json",
      page: "./demo/fail_wording.html",
      meta: "./demo/fail_wording_pr.json",
      report: "./demo/fail_wording.json",
      text: "./demo/fail_wording.txt",
      fallbackMeta:
        "Sample change with risky page wording — reviewer mark and kill line are present, but the page text still fails.",
    },
    reviewer: {
      label: "No reviewer",
      json: "./demo/fail_reviewer.json",
      page: "./demo/fail_reviewer.html",
      meta: "./demo/fail_reviewer_pr.json",
      report: "./demo/fail_reviewer.json",
      text: "./demo/fail_reviewer.txt",
      fallbackMeta:
        "Sample change with careful page wording and a kill line — but no independent reviewer mark.",
    },
    killline: {
      label: "No kill line",
      json: "./demo/fail_killline.json",
      page: "./demo/fail_killline.html",
      meta: "./demo/fail_killline_pr.json",
      report: "./demo/fail_killline.json",
      text: "./demo/fail_killline.txt",
      fallbackMeta:
        "Sample change with careful page wording and a reviewer mark — but no kill line saying when to stop shipping this claim.",
    },
    rush: {
      label: "Rush",
      json: "./demo/fail_rush.json",
      page: "./demo/fail_rush.html",
      meta: "./demo/fail_rush_pr.json",
      report: "./demo/fail_rush.json",
      text: "./demo/fail_rush.txt",
      fallbackMeta:
        "Sample change written to fail on purpose — risky page wording, no independent reviewer mark, no kill line.",
    },
  };

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

  function renderReport(targetId, report, opts = {}) {
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
    const fixture = root.querySelector("[data-fixture-links]");

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
        opts.fallbackMeta ||
        (isClean
          ? "Sample change with careful page wording, an independent reviewer mark, and a kill line."
          : "Sample change written on purpose with a shipping-gate miss.");
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

    if (fixture && opts.page && opts.meta && opts.report && opts.text) {
      const planted = isClean ? "" : " (written to fail on purpose)";
      fixture.innerHTML = `Sample files${planted}:
        <a href="${escapeHtml(opts.page)}">page</a> ·
        <a href="${escapeHtml(opts.meta)}">change meta</a> ·
        <a href="${escapeHtml(opts.report)}">report</a> ·
        <a href="${escapeHtml(opts.text)}">text</a>`;
    }
  }

  function preferredSample() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("sample");
    if (fromQuery && BLOCKED_SAMPLES[fromQuery]) return fromQuery;
    const saved = localStorage.getItem(SAMPLE_KEY);
    if (saved && BLOCKED_SAMPLES[saved]) return saved;
    return "wording";
  }

  function setSampleButtons(active) {
    document.querySelectorAll("[data-sample]").forEach((btn) => {
      const on = btn.dataset.sample === active;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-active", on);
    });
  }

  async function loadBlocked(sampleId) {
    const sample = BLOCKED_SAMPLES[sampleId] || BLOCKED_SAMPLES.wording;
    const id = BLOCKED_SAMPLES[sampleId] ? sampleId : "wording";
    setSampleButtons(id);
    localStorage.setItem(SAMPLE_KEY, id);

    const root = document.getElementById("report-fail");
    if (root) root.setAttribute("aria-busy", "true");

    try {
      const report = await fetch(sample.json).then((r) => {
        if (!r.ok) throw new Error("missing sample");
        return r.json();
      });
      renderReport("report-fail", report, {
        fallbackMeta: sample.fallbackMeta,
        page: sample.page,
        meta: sample.meta,
        report: sample.report,
        text: sample.text,
      });
    } catch {
      /* Static HTML fallback already in the page for wording */
    } finally {
      if (root) root.setAttribute("aria-busy", "false");
    }

    try {
      const url = new URL(window.location.href);
      if (id === "wording") url.searchParams.delete("sample");
      else url.searchParams.set("sample", id);
      window.history.replaceState({}, "", url);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    const clean = await fetch("./demo/clean.json").then((r) => r.json());
    renderReport("report-clean", clean, {
      page: "./demo/clean.html",
      meta: "./demo/clean_pr.json",
      report: "./demo/clean.json",
      text: "./demo/clean.txt",
    });

    document.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => loadBlocked(btn.dataset.sample));
    });

    await loadBlocked(preferredSample());
  }

  load().catch(() => {
    /* Static HTML fallback already in the page */
  });
})();
