/**
 * P-001 method-pack email gate (client).
 * Live: set form[data-endpoint] to Formspree URL
 * (https://formspree.io/f/XXXX) and data-dry-run="false".
 * Until then, shows dry-run status (no network).
 * Never embeds secrets. Never ships bible paths.
 *
 * Formspree POST contract (field names match index.html):
 *   email      — required; also mirrored to _replyto for Reply-To / autoresponse
 *   name       — optional
 *   intent     — optional (adopt_self | walkthrough | curious | hours)
 *   product_id — hidden (P-001)
 *   _subject   — Formspree subject override
 *   _gotcha    — Formspree honeypot (must stay empty)
 * Headers: Accept: application/json (AJAX; no redirect HTML)
 */
(function () {
  var form = document.getElementById("pack-gate-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");
  if (!form || !statusEl) return;

  function show(msg, kind) {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function isFormspree(url) {
    return /formspree\.io\/f\//i.test(url || "");
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    var email = ((form.elements.email && form.elements.email.value) || "").trim();
    var honeypot = (form.elements._gotcha && form.elements._gotcha.value) || "";
    if (honeypot) {
      show("Thanks — check your inbox shortly.", "ok");
      return;
    }
    if (!validEmail(email)) {
      show("Enter a valid work email.", "err");
      return;
    }

    var endpoint = (form.getAttribute("data-endpoint") || "").trim();
    var dryRun =
      form.getAttribute("data-dry-run") !== "false" || !endpoint;

    if (dryRun) {
      show(
        "Gate ready (dry-run). Live capture requires Formspree on crewless.se/method-pack/ — set endpoint in config.local.json, apply_gate_endpoint.py, then draft site PR. Your email was not sent.",
        "ok"
      );
      return;
    }

    submitBtn.disabled = true;
    var body = new FormData(form);

    // Formspree Reply-To + autoresponse target (email field alone is often enough;
    // _replyto is the explicit Formspree convention — always set from email).
    body.set("_replyto", email);
    body.set("email", email);

    var headers = { Accept: "application/json" };

    fetch(endpoint, {
      method: "POST",
      body: body,
      headers: headers,
      mode: "cors",
    })
      .then(function (res) {
        // Formspree returns 200 + { ok: true } or errors with JSON body.
        if (res.ok) {
          window.location.href = "thank-you.html";
          return null;
        }
        return res.json().then(
          function (data) {
            var detail =
              (data && (data.error || (data.errors && JSON.stringify(data.errors)))) ||
              "submit_failed";
            throw new Error(detail);
          },
          function () {
            throw new Error("submit_failed");
          }
        );
      })
      .then(function () {
        /* navigated */
      })
      .catch(function () {
        var hint = isFormspree(endpoint)
          ? " Formspree may need the form activated (confirm email in dashboard) or CORS allowed for this host."
          : "";
        show(
          "Could not reach the form endpoint. Try again, or reply via the ask path in the build log." +
            hint,
          "err"
        );
        submitBtn.disabled = false;
      });
  });
})();
