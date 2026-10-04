/**
 * Starter-pack email gate (client).
 * Live: form[data-endpoint] = Formspree URL, data-dry-run="false".
 * Never embeds secrets. Never ships private paths.
 *
 * Flow (ops-proof thank-you):
 *   1) mint request_id
 *   2) POST Formspree (capture)
 *   3) POST /api/pack-ask (ledger + ntfy) — required before thank-you
 * Pack send stays manual. Thank-you alone is not delivery proof.
 *
 * Fields: email, name, intent, product_id, _subject, _gotcha, request_id;
 * JS sets _replyto.
 * Headers: Accept: application/json (AJAX; no redirect HTML)
 */
(function () {
  var form = document.getElementById("pack-gate-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");
  var emailInput = document.getElementById("email");
  var emailError = document.getElementById("email-error");
  if (!form || !statusEl || !submitBtn) return;

  var idleLabel = submitBtn.textContent || "Send me the pack";
  var OPS_INGEST = "/api/pack-ask";

  function show(msg, kind) {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "status";
  }

  function setEmailError(msg) {
    if (!emailError || !emailInput) return;
    if (msg) {
      emailError.hidden = false;
      emailError.textContent = msg;
      emailInput.classList.add("is-invalid");
      emailInput.setAttribute("aria-invalid", "true");
    } else {
      emailError.hidden = true;
      emailError.textContent = "";
      emailInput.classList.remove("is-invalid");
      emailInput.removeAttribute("aria-invalid");
    }
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function mintRequestId() {
    var d = new Date();
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, "0");
    var day = String(d.getUTCDate()).padStart(2, "0");
    var bytes = new Uint8Array(4);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 4; i++) bytes[i] = (Math.random() * 256) | 0;
    }
    var hex = Array.prototype.map
      .call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
    return "PA-" + y + m + day + "-" + hex;
  }

  function resetBtn() {
    submitBtn.disabled = false;
    submitBtn.textContent = idleLabel;
  }

  if (emailInput) {
    emailInput.addEventListener("input", function () {
      setEmailError("");
      clearStatus();
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearStatus();
    setEmailError("");

    var email = ((form.elements.email && form.elements.email.value) || "").trim();
    var honeypot = (form.elements._gotcha && form.elements._gotcha.value) || "";
    if (honeypot) {
      window.location.href = "thank-you.html";
      return;
    }
    if (!validEmail(email)) {
      setEmailError("Enter a valid work email.");
      show("Enter a valid work email.", "err");
      if (emailInput) emailInput.focus();
      return;
    }

    var endpoint = (form.getAttribute("data-endpoint") || "").trim();
    var dryRun =
      form.getAttribute("data-dry-run") !== "false" || !endpoint;

    if (dryRun) {
      show(
        "Form is in dry-run mode here. On crewless.se your email is sent — this preview did not send it.",
        "ok"
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var requestId = mintRequestId();
    var intent =
      (form.elements.intent && form.elements.intent.value) || "";
    var productId =
      (form.elements.product_id && form.elements.product_id.value) || "P-001";

    var body = new FormData(form);
    body.set("_replyto", email);
    body.set("email", email);
    body.set("request_id", requestId);

    fetch(endpoint, {
      method: "POST",
      body: body,
      headers: { Accept: "application/json" },
      mode: "cors",
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(
            function () {
              throw new Error("formspree_failed");
            },
            function () {
              throw new Error("formspree_failed");
            }
          );
        }
        return fetch(OPS_INGEST, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: requestId,
            email: email,
            intent: intent,
            product_id: productId,
            source: "worker",
          }),
          mode: "cors",
          credentials: "omit",
        });
      })
      .then(function (res) {
        if (!res) return null;
        return res.json().then(
          function (data) {
            if (!res.ok || !data || data.ok !== true) {
              var err = new Error("ops_ingest_failed");
              err.detail = data && data.error;
              err.requestId = requestId;
              throw err;
            }
            if (data.pack_sent === true) {
              // Refuse invented send claims from the edge.
              throw new Error("ops_claimed_send");
            }
            window.location.href =
              "thank-you.html?rid=" + encodeURIComponent(requestId);
            return null;
          },
          function () {
            var err = new Error("ops_ingest_failed");
            err.requestId = requestId;
            throw err;
          }
        );
      })
      .then(function () {
        /* navigated */
      })
      .catch(function (err) {
        if (err && err.message === "ops_ingest_failed") {
          show(
            "Your email may be saved, but our ops alarm failed — please also write to us from the home page so we do not miss the pack send. Ref: " +
              ((err && err.requestId) || requestId),
            "err"
          );
        } else if (err && err.message === "ops_claimed_send") {
          show(
            "Ops response looked wrong (claimed a send). Write to us from the home page — we will not pretend the pack went out.",
            "err"
          );
        } else {
          show(
            "Could not send just now. Try again in a moment, or write to us from the home page.",
            "err"
          );
        }
        resetBtn();
      });
  });
})();
