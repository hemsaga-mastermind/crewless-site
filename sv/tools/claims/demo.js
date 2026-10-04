(() => {
  const THEME_KEY = "crewless-claims-theme";
  const SAMPLE_KEY = "crewless-claims-blocked-sample-sv";
  const BASE = "/tools/claims/demo";

  const BLOCKED_SAMPLES = {
    wellness: {
      json: `${BASE}/fail_wellness.json`,
      page: `${BASE}/fail_wellness.html`,
      report: `${BASE}/fail_wellness.json`,
      text: `${BASE}/fail_wellness.txt`,
      fallbackMeta: "Hälsolanding med övermodiga hälsopåståenden.",
    },
    beauty: {
      json: `${BASE}/fail_beauty.json`,
      page: `${BASE}/fail_beauty.html`,
      report: `${BASE}/fail_beauty.json`,
      text: `${BASE}/fail_beauty.txt`,
      fallbackMeta: "Skönhetsproduktsida med övermodig resultatcopy.",
    },
    course: {
      json: `${BASE}/fail_course.json`,
      page: `${BASE}/fail_course.md`,
      report: `${BASE}/fail_course.json`,
      text: `${BASE}/fail_course.txt`,
      fallbackMeta: "Kurssida med inkomstlöfte.",
    },
    fitness: {
      json: `${BASE}/fail_fitness.json`,
      page: `${BASE}/fail_fitness.md`,
      report: `${BASE}/fail_fitness.json`,
      text: `${BASE}/fail_fitness.txt`,
      fallbackMeta: "Träningsannons med resultatsgaranti.",
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

  function summarizeFinding(f) {
    const kind = String(f.kind || "").toLowerCase();
    const blob = `${f.line || ""} ${f.why || ""}`.toLowerCase();
    if (kind.includes("health") || blob.includes("disease") || blob.includes("anxiety")) {
      return "Sjukdoms- eller botformulering flaggad i exempelcopy";
    }
    if (
      kind.includes("proof") ||
      kind.includes("guarantee") ||
      blob.includes("clinically") ||
      blob.includes("clinical") ||
      blob.includes("miracle") ||
      blob.includes("guaranteed")
    ) {
      return "Kliniskt bevis eller garanti utan stöd";
    }
    if (kind.includes("income") || blob.includes("earn") || blob.includes("income")) {
      return "Inkomst- eller intäktslöfte flaggat";
    }
    if (
      kind.includes("closer") ||
      kind.includes("unknown") ||
      blob.includes("permanently") ||
      blob.includes("eliminates")
    ) {
      return "Stark effektformulering — behöver mänsklig titt innan publicering";
    }
    return "Påståendeform flaggad för mänsklig granskning";
  }

  function kindSv(kind) {
    const k = String(kind || "").toLowerCase();
    if (k.includes("health")) return "Hälsopåstående";
    if (k.includes("proof") || k.includes("guarantee")) return "Bevis- eller garantiformulering";
    if (k.includes("income")) return "Inkomstlöfte";
    return kind || "Behöver en titt";
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
      badge.textContent = isClean ? "Rent" : "Behöver fix";
    }

    if (verdict) {
      verdict.className = `verdict ${isClean ? "pass" : "fail"}`;
      verdict.textContent = isClean
        ? "Rent — inget riskfyllt flaggat. En person bör ändå granska innan publicering."
        : "Stoppad — riskfyllda påståendeformer fångade. Publicera inte som den är.";
    }

    if (meta) {
      meta.textContent =
        opts.fallbackMeta ||
        (isClean
          ? "Exempelsida med försiktig formulering. Inget riskfyllt flaggat."
          : "Exempelsida gjord med flit med övermodiga påståenden.");
    }

    if (findings) {
      if (!list.length) {
        findings.innerHTML =
          `<p class="empty">Inga problem hittades. En person bör ändå läsa innan det går live.</p>`;
      } else {
        findings.innerHTML = `<ul class="findings">${list
          .map(
            (f) => `<li>
              <span class="cat">${escapeHtml(kindSv(f.kind))}</span>
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
      /* static fallback */
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
    const clean = await fetch(`${BASE}/clean.json`).then((r) => r.json());
    renderReport("report-clean", clean, {
      fallbackMeta: "Exempel på en utomhusbutikssida med försiktig formulering. Inget riskfyllt flaggat.",
    });

    document.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => loadBlocked(btn.dataset.sample));
    });

    await loadBlocked(preferredSample());
  }

  load().catch(() => {});
})();
