/**
 * Starter-pack email gate (client).
 * Live: form[data-endpoint] = Formspree URL, data-dry-run="false".
 * Never embeds secrets. Never ships private paths.
 *
 * Fields: email, name, intent, product_id, _subject, _gotcha; JS sets _replyto.
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
    var body = new FormData(form);
    body.set("_replyto", email);
    body.set("email", email);

    fetch(endpoint, {
      method: "POST",
      body: body,
      headers: { Accept: "application/json" },
      mode: "cors",
    })
      .then(function (res) {
        if (res.ok) {
          window.location.href = "thank-you.html";
          return null;
        }
        return res.json().then(
          function () {
            throw new Error("submit_failed");
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
        show(
          "Kunde inte skicka just nu. Försök igen om en stund, eller skriv till oss från startsidan.",
          "err"
        );
        submitBtn.disabled = false;
        submitBtn.textContent = idleLabel;
      });
  });
})();
