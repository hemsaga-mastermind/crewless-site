/**
 * Starter-pack email gate (client) — Swedish copy.
 * Live: form[data-endpoint] = Formspree URL, data-dry-run="false".
 * Never embeds secrets. Never ships private paths.
 *
 * Flow (ops-proof thank-you):
 *   1) mint request_id
 *   2) POST Formspree (capture)
 *   3) POST /api/pack-ask (ledger + ntfy) — required before thank-you
 * Pack send stays manual. Thank-you alone is not delivery proof.
 */
(function () {
  var form = document.getElementById("pack-gate-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");
  var emailInput = document.getElementById("email");
  var emailError = document.getElementById("email-error");
  if (!form || !statusEl || !submitBtn) return;

  var idleLabel = submitBtn.textContent || "Skicka mig paketet";
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
      setEmailError("Ange en giltig jobbmejl.");
      show("Ange en giltig jobbmejl.", "err");
      if (emailInput) emailInput.focus();
      return;
    }

    var endpoint = (form.getAttribute("data-endpoint") || "").trim();
    var dryRun =
      form.getAttribute("data-dry-run") !== "false" || !endpoint;

    if (dryRun) {
      show(
        "Formuläret är i torrläge här. På crewless.se skickas mejlen — den här förhandsvisningen skickade den inte.",
        "ok"
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Skickar…";

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
            "Din mejl kan vara sparad, men vårt ops-larm misslyckades — skriv också till oss från startsidan så vi inte missar att skicka paketet. Ref: " +
              ((err && err.requestId) || requestId),
            "err"
          );
        } else if (err && err.message === "ops_claimed_send") {
          show(
            "Ops-svar såg fel ut (påstod utskick). Skriv till oss från startsidan — vi låtsas inte att paketet gick ut.",
            "err"
          );
        } else {
          show(
            "Kunde inte skicka just nu. Försök igen om en stund, eller skriv till oss från startsidan.",
            "err"
          );
        }
        resetBtn();
      });
  });
})();
