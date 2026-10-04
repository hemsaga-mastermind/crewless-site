(() => {
  const THEME_KEY = "crewless-shipping-gates-theme";
  const SAMPLE_KEY = "crewless-shipping-gates-blocked-sample-sv";
  const BASE = "/tools/shipping-gates/demo";

  const BLOCKED_SAMPLES = {
    wording: {
      json: `${BASE}/fail_wording.json`,
      page: `${BASE}/fail_wording.html`,
      meta: `${BASE}/fail_wording_pr.json`,
      report: `${BASE}/fail_wording.json`,
      text: `${BASE}/fail_wording.txt`,
      fallbackMeta: "Exempeländring med riskfylld sidformulering — granskare och kill-rad finns, men sidtexten faller ändå.",
    },
    reviewer: {
      json: `${BASE}/fail_reviewer.json`,
      page: `${BASE}/fail_reviewer.html`,
      meta: `${BASE}/fail_reviewer_pr.json`,
      report: `${BASE}/fail_reviewer.json`,
      text: `${BASE}/fail_reviewer.txt`,
      fallbackMeta: "Exempeländring utan oberoende granskarstämpel.",
    },
    killline: {
      json: `${BASE}/fail_killline.json`,
      page: `${BASE}/fail_killline.html`,
      meta: `${BASE}/fail_killline_pr.json`,
      report: `${BASE}/fail_killline.json`,
      text: `${BASE}/fail_killline.txt`,
      fallbackMeta: "Exempeländring utan kill-rad för när påståendet ska stoppas.",
    },
    rush: {
      json: `${BASE}/fail_rush.json`,
      page: `${BASE}/fail_rush.html`,
      meta: `${BASE}/fail_rush_pr.json`,
      report: `${BASE}/fail_rush.json`,
      text: `${BASE}/fail_rush.txt`,
      fallbackMeta: "Rushad ändring som hoppar över grindarna.",
    },
  };

  function preferTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "day" || saved === "night") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
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

  function kindSv(kind) {
    const k = String(kind || "").toLowerCase();
    if (k.includes("wording") || k.includes("page")) return "Sidformulering";
    if (k.includes("reviewer")) return "Granskarstämpel";
    if (k.includes("kill")) return "Kill-rad";
    if (k.includes("claim") || k.includes("risky")) return "Riskfyllt påstående";
    return kind || "Behöver en titt";
  }

  function detailSv(detail) {
    const d = String(detail || "");
    const map = [
      ["Careful marketing copy", "Försiktig marknadsföringscopy — inget riskfyllt flaggat"],
      ["Independent reviewer label present", "Oberoende granskarlabel finns"],
      ["A kill line states when to stop shipping this claim", "En kill-rad säger när påståendet ska stoppas"],
      ["Risky claim shapes flagged in the sample page", "Riskfyllda påståendeformer flaggade i exempelsidan"],
      ["Unproven performance-claim phrasing flagged", "Obevisad resultatformulering flaggad"],
      ["Return-percentage claim shape flagged", "Avkastningsprocent-form flaggad"],
      ["Money or desk vocabulary flagged in page text", "Pengar- eller deskvokabulär flaggad i sidtext"],
      ["Independent reviewer label missing", "Oberoende granskarlabel saknas"],
      ["Kill line missing", "Kill-rad saknas"],
    ];
    for (const pair of map) {
      if (d.includes(pair[0]) || d === pair[0]) return pair[1];
    }
    return d;
  }

  function renderList(items, emptyHtml) {
    if (!items || !items.length) return emptyHtml;
    return `<ul class="findings">${items
      .map(
        (c) => `<li>
          <span class="cat">${escapeHtml(kindSv(c.kind))}</span>
          <span class="detail">${escapeHtml(detailSv(c.detail))}</span>
        </li>`
      )
      .join("")}</ul>`;
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
    const checks = root.querySelector("[data-checks]");
    const findings = root.querySelector("[data-findings]");
    const fixture = root.querySelector("[data-fixture-links]");

    if (badge) {
      badge.className = `badge ${isClean ? "pass" : "fail"}`;
      badge.textContent = isClean ? "Rent" : "Behöver fix";
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Rent — grinden öppen. En person bör ändå granska innan publicering."
        : "Stoppad — skicka inte som den är.";
    }

    if (meta) {
      meta.textContent =
        opts.fallbackMeta ||
        (isClean
          ? "Exempeländring med försiktig sidformulering, oberoende granskarstämpel och kill-rad."
          : "Exempeländring gjord med flit med en grindmiss.");
    }

    if (checks && Array.isArray(report.checks)) {
      checks.innerHTML = renderList(
        report.checks.map((c) => ({ kind: c.kind, detail: c.detail })),
        `<p class="empty">Inga grindkontroller listade.</p>`
      );
    }

    if (findings) {
      findings.innerHTML = renderList(
        list,
        `<p class="empty">Inga stopp. En person bör ändå läsa innan det går live.</p>`
      );
    }

    if (fixture && opts.page && opts.meta && opts.report && opts.text) {
      const planted = isClean ? "" : " (gjorda för att faila med flit)";
      fixture.innerHTML = `Exempelfiler${planted}:
        <a href="${escapeHtml(opts.page)}">sida</a> ·
        <a href="${escapeHtml(opts.meta)}">ändringsmeta</a> ·
        <a href="${escapeHtml(opts.report)}">rapport</a> ·
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
      /* static fallback */
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
    const clean = await fetch(`${BASE}/clean.json`).then((r) => r.json());
    renderReport("report-clean", clean, {
      fallbackMeta: "Exempeländring med försiktig sidformulering, oberoende granskarstämpel och kill-rad.",
      page: `${BASE}/clean.html`,
      meta: `${BASE}/clean_pr.json`,
      report: `${BASE}/clean.json`,
      text: `${BASE}/clean.txt`,
    });

    document.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => loadBlocked(btn.dataset.sample));
    });

    await loadBlocked(preferredSample());
  }

  load().catch(() => {});
})();
