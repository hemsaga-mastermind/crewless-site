(() => {
  const THEME_KEY = "crewless-claims-theme";
  const SAMPLE_KEY = "crewless-claims-blocked-sample";

  const BLOCKED_SAMPLES = {
    wellness: {
      label: "Wellness",
      json: "./demo/fail_wellness.json",
      page: "./demo/fail_wellness.html",
      report: "./demo/fail_wellness.json",
      text: "./demo/fail_wellness.txt",
      fallbackMeta: "Wellness landing with overconfident health claim shapes.",
    },
    beauty: {
      label: "Beauty",
      json: "./demo/fail_beauty.json",
      page: "./demo/fail_beauty.html",
      report: "./demo/fail_beauty.json",
      text: "./demo/fail_beauty.txt",
      fallbackMeta: "Beauty product page with overconfident results wording.",
    },
    course: {
      label: "Course",
      json: "./demo/fail_course.json",
      page: "./demo/fail_course.md",
      report: "./demo/fail_course.json",
      text: "./demo/fail_course.txt",
      fallbackMeta: "Course sales page with an earnings promise.",
    },
    fitness: {
      label: "Fitness",
      json: "./demo/fail_fitness.json",
      page: "./demo/fail_fitness.md",
      report: "./demo/fail_fitness.json",
      text: "./demo/fail_fitness.txt",
      fallbackMeta: "Fitness ad with a results guarantee.",
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
      blob.includes("clinical") ||
      blob.includes("miracle") ||
      blob.includes("guaranteed")
    ) {
      return "Clinical-proof or guarantee phrasing flagged without support";
    }
    if (kind.includes("income") || blob.includes("earn") || blob.includes("income")) {
      return "Income or earnings promise phrasing flagged";
    }
    if (
      kind.includes("closer") ||
      kind.includes("unknown") ||
      blob.includes("permanently") ||
      blob.includes("eliminates")
    ) {
      return "Strong efficacy language — needs a human look before publish";
    }
    return "Claim shape flagged for human review (see sample page under report details)";
  }

  function renderReport(targetId, report, opts = {}) {
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
    const fixture = root.querySelector("[data-fixture-links]");

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
        opts.fallbackMeta ||
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
    return "wellness";
  }

  function setSampleButtons(active) {
    document.querySelectorAll("[data-sample]").forEach((btn) => {
      const on = btn.dataset.sample === active;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-active", on);
    });
  }

  async function loadBlocked(sampleId) {
    const sample = BLOCKED_SAMPLES[sampleId] || BLOCKED_SAMPLES.wellness;
    const id = BLOCKED_SAMPLES[sampleId] ? sampleId : "wellness";
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
      /* Static HTML fallback already in the page for wellness */
    } finally {
      if (root) root.setAttribute("aria-busy", "false");
    }

    try {
      const url = new URL(window.location.href);
      if (id === "wellness") url.searchParams.delete("sample");
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
