(() => {
  const THEME_KEY = "crewless-honesty-theme";
  const SAMPLE_KEY = "crewless-honesty-blocked-sample";

  const BLOCKED_SAMPLES = {
    money: {
      label: "Money",
      json: "./demo/fail_money.json",
      page: "./demo/fail_money.html",
      report: "./demo/fail_money.json",
      text: "./demo/fail_money.txt",
      fallbackMeta: "Public page with currency figures that should stay private.",
    },
    returns: {
      label: "Returns",
      json: "./demo/fail_returns.json",
      page: "./demo/fail_returns.html",
      report: "./demo/fail_returns.json",
      text: "./demo/fail_returns.txt",
      fallbackMeta: "Results page with return-percentage and performance claim shapes.",
    },
    ops: {
      label: "Ops talk",
      json: "./demo/fail_ops.json",
      page: "./demo/fail_ops.html",
      report: "./demo/fail_ops.json",
      text: "./demo/fail_ops.txt",
      fallbackMeta: "Ops note that leaks private money-desk vocabulary on a public page.",
    },
    dayjob: {
      label: "Day job",
      json: "./demo/fail_dayjob.json",
      page: "./demo/fail_dayjob.html",
      report: "./demo/fail_dayjob.json",
      text: "./demo/fail_dayjob.txt",
      fallbackMeta: "About page that links the work to a day job / employer.",
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

  /** Paraphrase finding details so static crawlers / noscript stay clean. */
  function summarizeFinding(finding) {
    const detail = String(finding.detail || "");
    if (detail.startsWith("currency/number figure")) {
      return "Currency or money-figure shape flagged in page text";
    }
    if (detail.startsWith("money/") && detail.includes("vocabulary")) {
      return "Money-desk vocabulary flagged in page text";
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
    if (detail.includes("independence") || detail.includes("day-job") || detail.includes("employer")) {
      return "Day-job or employer phrasing flagged";
    }
    return "Honesty risk flagged (see report details for the match)";
  }

  function humanCategory(finding) {
    const cat = String(finding.category || "").toLowerCase();
    if (cat.includes("independence")) return "Check this link";
    if (cat.includes("denial")) return "Check this denial";
    if (cat.includes("money") || cat.includes("claim")) return "Risky claim";
    return "Needs a look";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderReport(targetId, report, opts = {}) {
    const root = document.getElementById(targetId);
    if (!root || !report) return;

    const list = Array.isArray(report.findings) ? report.findings : [];
    const isClean =
      Boolean(report.clean) &&
      (Number(report.risk_count) === 0 || list.length === 0);

    const badge = root.querySelector("[data-badge]");
    const verdict = root.querySelector("[data-verdict]");
    const meta = root.querySelector("[data-meta]");
    const findings = root.querySelector("[data-findings]");
    const fixture = root.querySelector("[data-fixture-links]");

    if (badge) {
      badge.className = `badge ${isClean ? "pass" : "fail"}`;
      badge.textContent = isClean ? "Clean" : "Needs fix";
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Clean — nothing risky flagged. A person should still review before publish."
        : "Blocked — honesty slips caught. Do not publish as-is.";
    }

    if (meta) {
      meta.textContent =
        report.summary ||
        opts.fallbackMeta ||
        (isClean
          ? "Sample page with careful wording. Nothing risky flagged."
          : "Sample page written on purpose with honesty slips.");
    }

    if (findings) {
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

    if (fixture && opts.page && opts.report && opts.text) {
      fixture.innerHTML = `Sample files (written to fail on purpose):
        <a href="${escapeHtml(opts.page)}">page</a> ·
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
    return "money";
  }

  function setSampleButtons(active) {
    document.querySelectorAll("[data-sample]").forEach((btn) => {
      const on = btn.dataset.sample === active;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-active", on);
    });
  }

  async function loadBlocked(sampleId) {
    const sample = BLOCKED_SAMPLES[sampleId] || BLOCKED_SAMPLES.money;
    const id = BLOCKED_SAMPLES[sampleId] ? sampleId : "money";
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
        report: sample.report,
        text: sample.text,
      });
    } catch {
      /* Static HTML fallback already in the page for money */
    } finally {
      if (root) root.setAttribute("aria-busy", "false");
    }

    try {
      const url = new URL(window.location.href);
      if (id === "money") url.searchParams.delete("sample");
      else url.searchParams.set("sample", id);
      window.history.replaceState({}, "", url);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    const clean = await fetch("./demo/clean.json").then((r) => r.json());
    renderReport("report-clean", clean);

    document.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => loadBlocked(btn.dataset.sample));
    });

    await loadBlocked(preferredSample());
  }

  load().catch(() => {
    /* Static HTML fallback already in the page */
  });
})();
