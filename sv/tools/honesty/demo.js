(() => {
  const THEME_KEY = "crewless-honesty-theme";
  const SAMPLE_KEY = "crewless-honesty-blocked-sample-sv";
  const BASE = "/tools/honesty/demo";

  const BLOCKED_SAMPLES = {
    money: {
      json: `${BASE}/fail_money.json`,
      page: `${BASE}/fail_money.html`,
      report: `${BASE}/fail_money.json`,
      text: `${BASE}/fail_money.txt`,
      fallbackMeta: "Publik sida med belopp som borde stanna privat.",
    },
    returns: {
      json: `${BASE}/fail_returns.json`,
      page: `${BASE}/fail_returns.html`,
      report: `${BASE}/fail_returns.json`,
      text: `${BASE}/fail_returns.txt`,
      fallbackMeta: "Resultatsida med avkastningsprocent och resultatformuleringar.",
    },
    ops: {
      json: `${BASE}/fail_ops.json`,
      page: `${BASE}/fail_ops.html`,
      report: `${BASE}/fail_ops.json`,
      text: `${BASE}/fail_ops.txt`,
      fallbackMeta: "Ops-anteckning som läcker privat deskvokabulär på en publik sida.",
    },
    dayjob: {
      json: `${BASE}/fail_dayjob.json`,
      page: `${BASE}/fail_dayjob.html`,
      report: `${BASE}/fail_dayjob.json`,
      text: `${BASE}/fail_dayjob.txt`,
      fallbackMeta: "Om-sida som kopplar arbetet till ett dagjobb / arbetsgivare.",
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

  function summarizeFinding(finding) {
    const detail = String(finding.detail || "");
    if (detail.startsWith("currency/number figure")) {
      return "Valuta- eller beloppsform flaggad i sidtext";
    }
    if (detail.startsWith("money/") && detail.includes("vocabulary")) {
      return "Deskvokabulär kring pengar flaggad i sidtext";
    }
    if (detail.startsWith("unproven performance claim")) {
      return "Obevisad resultatformulering flaggad";
    }
    if (detail.startsWith("return-percentage claim")) {
      return "Avkastningsprocent-form flaggad";
    }
    if (detail.includes("exposure-denial")) {
      return "Förnekelseformulering — kontrollera mot verkligheten";
    }
    if (detail.includes("independence") || detail.includes("day-job") || detail.includes("employer")) {
      return "Dagjobb- eller arbetsgivarformulering flaggad";
    }
    return "Ärlighetsrisk flaggad (se rapportdetaljer)";
  }

  function humanCategory(finding) {
    const cat = String(finding.category || "").toLowerCase();
    if (cat.includes("independence")) return "Kolla den här länken";
    if (cat.includes("denial")) return "Kolla den här förnekelsen";
    if (cat.includes("money") || cat.includes("claim")) return "Riskfyllt påstående";
    return "Behöver en titt";
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
      badge.textContent = isClean ? "Rent" : "Behöver fix";
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Rent — inget riskfyllt flaggat. En person bör ändå granska innan publicering."
        : "Stoppad — ärlighetsglapp fångade. Publicera inte som den är.";
    }

    if (meta) {
      meta.textContent =
        opts.fallbackMeta ||
        (isClean
          ? "Exempelsida med försiktig formulering. Inget riskfyllt flaggat."
          : "Exempelsida gjord med flit med ärlighetsglapp.");
    }

    if (findings) {
      if (!list.length) {
        findings.innerHTML =
          `<p class="empty">Inga problem hittades. En person bör ändå läsa innan det går live.</p>`;
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
      fixture.innerHTML = `Exempelfiler (gjorda för att faila med flit):
        <a href="${escapeHtml(opts.page)}">sida</a> ·
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
      /* static HTML fallback */
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
    const clean = await fetch(`${BASE}/clean.json`).then((r) => r.json());
    renderReport("report-clean", clean, {
      fallbackMeta: "Exempelsida med försiktig formulering. Inget riskfyllt flaggat.",
    });

    document.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => loadBlocked(btn.dataset.sample));
    });

    await loadBlocked(preferredSample());
  }

  load().catch(() => {});
})();
