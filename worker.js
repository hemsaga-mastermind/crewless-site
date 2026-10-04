/**
 * crewless-site Worker — static assets + pack-ask ops ingest.
 *
 * POST /api/pack-ask
 *   Body JSON: { request_id, email, intent?, product_id?, source? }
 *   - Hashes email (never stores raw)
 *   - Writes KV row (durable ops proof)
 *   - Pushes ntfy to PACK_ASK_NTFY_URL (required secret)
 *   - Does NOT send the pack. Does NOT claim delivery.
 *
 * POST /api/pack-ask/formspree  (optional later)
 *   Same ingest shape if Formspree webhook is wired; still no auto-send.
 *
 * Thank-you alone is never proof — client must get ok:true from /api/pack-ask.
 */
const ALLOWED_ORIGINS = new Set([
  "https://crewless.se",
  "https://www.crewless.se",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://crewless.se";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin || "https://crewless.se"),
    },
  });
}

function isRequestId(v) {
  return typeof v === "string" && /^PA-\d{8}-[0-9a-f]{8}$/i.test(v);
}

function validEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function redactEmail(email) {
  const norm = String(email || "").trim().toLowerCase();
  const at = norm.indexOf("@");
  if (at < 1) return null;
  return `${norm[0]}***@${norm.slice(at + 1)}`;
}

async function sha256Hex16(text) {
  const data = new TextEncoder().encode(text);
  const dig = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(dig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

async function pushNtfy(env, text, title) {
  const url = (env.PACK_ASK_NTFY_URL || "").trim();
  if (!url) {
    return { ok: false, error: "notify_unconfigured" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Title: title || "P-001 pack ask",
      Priority: "high",
      Tags: "package,email",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: text,
  });
  if (!res.ok) {
    return { ok: false, error: `ntfy_http_${res.status}` };
  }
  return { ok: true };
}

async function ingestAsk(env, payload, source) {
  const requestId = payload.request_id;
  const email = String(payload.email || "").trim().toLowerCase();
  if (!isRequestId(requestId)) {
    return { status: 400, body: { ok: false, error: "bad_request_id" } };
  }
  if (!validEmail(email)) {
    return { status: 400, body: { ok: false, error: "bad_email" } };
  }

  const emailHash = await sha256Hex16(email);
  const emailRedacted = redactEmail(email);
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const intent = typeof payload.intent === "string" ? payload.intent.slice(0, 64) : "";
  const productId =
    typeof payload.product_id === "string" && payload.product_id
      ? payload.product_id.slice(0, 32)
      : "P-001";

  const row = {
    request_id: requestId,
    email_hash: emailHash,
    email_redacted: emailRedacted,
    ts,
    intent,
    product_id: productId,
    source: source || payload.source || "worker",
    pack_sent: false,
  };

  if (env.PACK_ASKS) {
    const existing = await env.PACK_ASKS.get(`ask:${requestId}`, "json");
    if (existing && existing.email_hash === emailHash) {
      // Idempotent replay — still require notify configured; do not claim send.
      row.ts = existing.ts || ts;
      row.replay = true;
    }
    await env.PACK_ASKS.put(`ask:${requestId}`, JSON.stringify(row), {
      expirationTtl: 60 * 60 * 24 * 90, // 90d
    });
  }

  const ntfyBody = [
    "P-001 method pack REQUEST (not sent yet)",
    `request_id=${requestId}`,
    `email=${emailRedacted}`,
    `email_hash=${emailHash}`,
    `ts=${row.ts}`,
    intent ? `intent=${intent}` : null,
    "Action: FIRST_ASK_CHECKLIST → manual zip → log_ask --kind delivery",
  ]
    .filter(Boolean)
    .join("\n");

  const notify = await pushNtfy(env, ntfyBody, "P-001 pack ask");
  row.notify_ok = !!notify.ok;
  if (env.PACK_ASKS) {
    await env.PACK_ASKS.put(`ask:${requestId}`, JSON.stringify(row), {
      expirationTtl: 60 * 60 * 24 * 90,
    });
  }

  if (!notify.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        error: notify.error || "notify_failed",
        request_id: requestId,
        email_hash: emailHash,
        email_redacted: emailRedacted,
        pack_sent: false,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      request_id: requestId,
      email_hash: emailHash,
      email_redacted: emailRedacted,
      ts: row.ts,
      pack_sent: false,
      notify_ok: true,
    },
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handlePackAsk(request, env, origin) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }
  const result = await ingestAsk(env, payload, "worker");
  return json(result.body, result.status, origin);
}

async function handleFormspreeWebhook(request, env, origin) {
  // Optional path — enable in Formspree only if free/unlocked. Same no-send rule.
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }
  // Formspree often nests fields; accept either flat or { data: {...} }
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const normalized = {
    request_id: data.request_id || payload.request_id,
    email: data.email || payload.email,
    intent: data.intent || payload.intent,
    product_id: data.product_id || payload.product_id || "P-001",
    source: "formspree",
  };
  const result = await ingestAsk(env, normalized, "formspree");
  return json(result.body, result.status, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (
      (url.pathname === "/api/pack-ask" || url.pathname === "/api/pack-ask/formspree") &&
      request.method === "OPTIONS"
    ) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/pack-ask" && request.method === "POST") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json({ ok: false, error: "origin_refused" }, 403, "https://crewless.se");
      }
      return handlePackAsk(request, env, origin);
    }

    if (url.pathname === "/api/pack-ask/formspree" && request.method === "POST") {
      // Webhook may have no browser Origin; still no pack send.
      return handleFormspreeWebhook(request, env, origin || "https://crewless.se");
    }

    // Static site
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("assets binding missing", { status: 500 });
  },
};
