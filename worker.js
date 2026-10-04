/**
 * crewless-site Worker — Phase B pack-ask: ledger + ops email.
 *
 * SSOT: docs/crewless-pack-ask-enterprise-inbox.md (Phase B)
 * Cutover (Phase C auto-zip): docs/crewless-pack-ask-auto-email-cutover.md
 *
 * POST /api/pack-ask
 *   Body JSON: { request_id, email, intent?, product_id?, source? }
 *   1) Hash + redact email (never store raw in KV)
 *   2) Write KV ledger row (status: captured → ops_notified)
 *   3) Ops notify (REQUIRED for ok:true):
 *        - Postmark if POSTMARK_SERVER_TOKEN set  (cutover provider)
 *        - Resend if RESEND_API_KEY set           (optional; not required)
 *        - formspree mode: trust Formspree Notifications → admin@dancing-flamingo.org
 *          (shippable without transactional key; documented BCC/notify pattern)
 *   4) ntfy OPTIONAL — PACK_ASK_NTFY_URL best-effort only; never gates ok:true
 *   5) pack_sent stays false (Phase C owns visitor auto-zip)
 *
 * Thank-you alone is never proof of pack send.
 * REFUSE: inventing API keys · ntfy as primary · claiming pack_sent.
 */
const ALLOWED_ORIGINS = new Set([
  "https://crewless.se",
  "https://www.crewless.se",
]);

const DEFAULT_OPS_TO = "admin@dancing-flamingo.org";
const KV_TTL = 60 * 60 * 24 * 90; // 90d

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

function opsTo(env) {
  return (
    (env.PACK_ASK_OPS_TO || env.PACK_ASK_BCC_OPS || "").trim() || DEFAULT_OPS_TO
  );
}

function opsFrom(env) {
  return (
    (env.PACK_ASK_FROM || "").trim() ||
    "Crewless Pack Ask <noreply@crewless.se>"
  );
}

/**
 * Resolve notify channel.
 * auto: Postmark → Resend → formspree (shippable without invented keys)
 * postmark|resend: fail-closed without matching key
 * formspree: ledger + documented Formspree Notifications → admin@dancing-flamingo.org
 */
function resolveNotifyMode(env) {
  const raw = String(env.PACK_ASK_OPS_NOTIFY_MODE || "auto")
    .trim()
    .toLowerCase();
  const mode = raw || "auto";
  const postmark = (env.POSTMARK_SERVER_TOKEN || env.PACK_ASK_OPS_MAIL_TOKEN || "").trim();
  const resend = (env.RESEND_API_KEY || "").trim();

  if (mode === "formspree") {
    return { channel: "formspree", token: "", provider: null };
  }
  if (mode === "postmark") {
    return postmark
      ? { channel: "postmark", token: postmark, provider: "postmark" }
      : { channel: null, token: "", provider: null, error: "email_unconfigured" };
  }
  if (mode === "resend") {
    return resend
      ? { channel: "resend", token: resend, provider: "resend" }
      : { channel: null, token: "", provider: null, error: "email_unconfigured" };
  }
  // auto
  if (postmark) {
    return { channel: "postmark", token: postmark, provider: "postmark" };
  }
  if (resend) {
    return { channel: "resend", token: resend, provider: "resend" };
  }
  return { channel: "formspree", token: "", provider: null };
}

function opsMailBodies(row) {
  const subject = `P-001 pack ask · ${row.request_id}`;
  const text = [
    "P-001 method pack REQUEST (not sent to visitor yet — Phase B)",
    `request_id=${row.request_id}`,
    `email_redacted=${row.email_redacted}`,
    `email_hash=${row.email_hash}`,
    `ts=${row.ts}`,
    `status=${row.status}`,
    `source=${row.source}`,
    row.intent ? `intent=${row.intent}` : null,
    `product_id=${row.product_id}`,
    "",
    "Action: FIRST_ASK_CHECKLIST → manual zip (until Phase C) → log_ask --kind delivery",
    "Ledger: import_worker_ask.py / asks_ledger.jsonl",
    "Do not treat thank-you HTML as pack_sent.",
  ]
    .filter((line) => line !== null)
    .join("\n");
  return { subject, text };
}

async function sendPostmarkOps(env, row, replyTo) {
  const token = (env.POSTMARK_SERVER_TOKEN || env.PACK_ASK_OPS_MAIL_TOKEN || "").trim();
  if (!token) {
    return { ok: false, error: "email_unconfigured", channel: "postmark" };
  }
  const { subject, text } = opsMailBodies(row);
  const payload = {
    From: opsFrom(env),
    To: opsTo(env),
    Subject: subject,
    TextBody: text,
    MessageStream: "outbound",
  };
  if (replyTo && validEmail(replyTo)) {
    payload.ReplyTo = replyTo;
  }
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: `postmark_http_${res.status}`,
      channel: "postmark",
      detail: detail.slice(0, 200),
    };
  }
  const data = await res.json().catch(() => ({}));
  return {
    ok: true,
    channel: "postmark",
    provider_message_id: data.MessageID || null,
  };
}

async function sendResendOps(env, row, replyTo) {
  const token = (env.RESEND_API_KEY || "").trim();
  if (!token) {
    return { ok: false, error: "email_unconfigured", channel: "resend" };
  }
  const { subject, text } = opsMailBodies(row);
  const payload = {
    from: opsFrom(env),
    to: [opsTo(env)],
    subject,
    text,
  };
  if (replyTo && validEmail(replyTo)) {
    payload.reply_to = replyTo;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: `resend_http_${res.status}`,
      channel: "resend",
      detail: detail.slice(0, 200),
    };
  }
  const data = await res.json().catch(() => ({}));
  return {
    ok: true,
    channel: "resend",
    provider_message_id: data.id || null,
  };
}

/**
 * Formspree path: capture already succeeded client-side; Notifications must
 * be wired to admin@dancing-flamingo.org (see FORMSPREE_OPS.md). Worker cannot re-send
 * Formspree mail — ledger write + documented channel = Phase B shippable notify.
 */
function acceptFormspreeOps(row) {
  return {
    ok: true,
    channel: "formspree",
    provider_message_id: null,
    note: "ops_email_via_formspree_notifications",
    request_id: row.request_id,
  };
}

async function notifyOps(env, row, visitorEmail) {
  const resolved = resolveNotifyMode(env);
  if (!resolved.channel) {
    return { ok: false, error: resolved.error || "email_unconfigured", channel: null };
  }
  if (resolved.channel === "postmark") {
    return sendPostmarkOps(env, row, visitorEmail);
  }
  if (resolved.channel === "resend") {
    return sendResendOps(env, row, visitorEmail);
  }
  if (resolved.channel === "formspree") {
    return acceptFormspreeOps(row);
  }
  return { ok: false, error: "notify_mode_unknown", channel: resolved.channel };
}

/** Optional side-channel — never required for ok:true. */
async function pushNtfyOptional(env, text, title) {
  const url = (env.PACK_ASK_NTFY_URL || "").trim();
  if (!url) {
    return { ok: false, skipped: true, error: "ntfy_dormant" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Title: title || "P-001 pack ask",
        Priority: "default",
        Tags: "package,email",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: text,
    });
    if (!res.ok) {
      return { ok: false, skipped: false, error: `ntfy_http_${res.status}` };
    }
    return { ok: true, skipped: false };
  } catch {
    return { ok: false, skipped: false, error: "ntfy_fetch_failed" };
  }
}

async function putAsk(env, row) {
  if (!env.PACK_ASKS) {
    return { ok: false, error: "kv_unconfigured" };
  }
  await env.PACK_ASKS.put(`ask:${row.request_id}`, JSON.stringify(row), {
    expirationTtl: KV_TTL,
  });
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
  const intent =
    typeof payload.intent === "string" ? payload.intent.slice(0, 64) : "";
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
    status: "captured",
    pack_sent: false,
    notify_channel: null,
    notify_ok: false,
    ntfy_ok: false,
  };

  const hasKv = !!env.PACK_ASKS;
  // Without CLOUDFLARE_API_TOKEN, Mac cannot create PACK_ASKS. Formspree mode
  // still ships ops notify (Notifications → admin@dancing-flamingo.org); ledger
  // binds when Founder pastes KV id. Transactional modes stay fail-closed.
  if (!hasKv) {
    const resolved = resolveNotifyMode(env);
    if (resolved.channel !== "formspree") {
      return {
        status: 503,
        body: {
          ok: false,
          error: "kv_unconfigured",
          request_id: requestId,
          pack_sent: false,
        },
      };
    }
    const notify = await notifyOps(env, row, email);
    row.notify_ok = !!notify.ok;
    row.notify_channel = notify.channel || null;
    if (!notify.ok) {
      return {
        status: 503,
        body: {
          ok: false,
          error: notify.error || "ops_email_failed",
          request_id: requestId,
          email_hash: emailHash,
          email_redacted: emailRedacted,
          pack_sent: false,
          notify_ok: false,
          ops_notified: false,
          notify_channel: notify.channel || null,
          ledger_ok: false,
        },
      };
    }
    row.status = "ops_notified";
    // Optional ntfy — never blocks thank-you (dormant when secret unset).
    const ntfyBody = [
      "P-001 pack ask (ops email path · kv deferred)",
      `request_id=${requestId}`,
      `email=${emailRedacted}`,
      `channel=${row.notify_channel}`,
      `ts=${row.ts}`,
    ].join("\n");
    const ntfy = await pushNtfyOptional(env, ntfyBody, "P-001 pack ask");
    row.ntfy_ok = !!ntfy.ok;
    return {
      status: 200,
      body: {
        ok: true,
        request_id: requestId,
        email_hash: emailHash,
        email_redacted: emailRedacted,
        ts: row.ts,
        status: "ops_notified",
        pack_sent: false,
        notify_ok: true,
        ops_notified: true,
        notify_channel: row.notify_channel,
        ledger_ok: false,
        ledger_note: "kv_deferred",
        ntfy_ok: row.ntfy_ok,
      },
    };
  }

  const existing = await env.PACK_ASKS.get(`ask:${requestId}`, "json");
  if (existing && existing.email_hash === emailHash && existing.notify_ok === true) {
    // Idempotent success replay — do not double-send ops mail.
    return {
      status: 200,
      body: {
        ok: true,
        request_id: requestId,
        email_hash: emailHash,
        email_redacted: emailRedacted,
        ts: existing.ts || ts,
        status: existing.status || "ops_notified",
        pack_sent: false,
        notify_ok: true,
        ops_notified: true,
        notify_channel: existing.notify_channel || null,
        ledger_ok: true,
        replay: true,
      },
    };
  }
  if (existing && existing.email_hash === emailHash) {
    row.ts = existing.ts || ts;
    row.replay = true;
  }

  const ledgerWrite = await putAsk(env, row);
  if (!ledgerWrite.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        error: ledgerWrite.error || "ledger_failed",
        request_id: requestId,
        pack_sent: false,
      },
    };
  }

  const notify = await notifyOps(env, row, email);
  row.notify_ok = !!notify.ok;
  row.notify_channel = notify.channel || null;
  row.provider_message_id = notify.provider_message_id || null;
  if (notify.ok) {
    row.status = "ops_notified";
  } else {
    row.status = "failed";
    row.notify_error = notify.error || "notify_failed";
  }
  await putAsk(env, row);

  if (!notify.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        error: notify.error || "ops_email_failed",
        request_id: requestId,
        email_hash: emailHash,
        email_redacted: emailRedacted,
        pack_sent: false,
        notify_ok: false,
        ops_notified: false,
        notify_channel: notify.channel || null,
        ledger_ok: true,
      },
    };
  }

  // Optional ntfy — never blocks thank-you.
  const ntfyBody = [
    "P-001 pack ask (ops email path)",
    `request_id=${requestId}`,
    `email=${emailRedacted}`,
    `channel=${row.notify_channel}`,
    `ts=${row.ts}`,
  ].join("\n");
  const ntfy = await pushNtfyOptional(env, ntfyBody, "P-001 pack ask");
  row.ntfy_ok = !!ntfy.ok;
  if (!ntfy.skipped) {
    await putAsk(env, row);
  }

  return {
    status: 200,
    body: {
      ok: true,
      request_id: requestId,
      email_hash: emailHash,
      email_redacted: emailRedacted,
      ts: row.ts,
      status: "ops_notified",
      pack_sent: false,
      notify_ok: true,
      ops_notified: true,
      notify_channel: row.notify_channel,
      provider_message_id: row.provider_message_id,
      ledger_ok: true,
      ntfy_ok: row.ntfy_ok,
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
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : payload;
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
      (url.pathname === "/api/pack-ask" ||
        url.pathname === "/api/pack-ask/formspree") &&
      request.method === "OPTIONS"
    ) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/pack-ask" && request.method === "POST") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json(
          { ok: false, error: "origin_refused" },
          403,
          "https://crewless.se"
        );
      }
      return handlePackAsk(request, env, origin);
    }

    if (url.pathname === "/api/pack-ask/formspree" && request.method === "POST") {
      return handleFormspreeWebhook(
        request,
        env,
        origin || "https://crewless.se"
      );
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("assets binding missing", { status: 500 });
  },
};
