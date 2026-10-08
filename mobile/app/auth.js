(() => {
  "use strict";
  const config = window.HopperCloudConfig || {};
  const t = (key) => window.HopperI18n?.t(key) || key;
  const byId = (id) => document.getElementById(id);
  let client = null,
    authorized = null,
    pendingFactor = null,
    enrollFactor = null;
  let expectedEmail = null,
    pendingUserId = null,
    candidate = null;
  let busy = false,
    generation = 0,
    phase = "login",
    feedbackKey = "",
    feedbackTarget = "login-status";
  const configured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);

  function matches(identity, user) {
    return Boolean(
      identity &&
      user?.authAccountId === identity.id &&
      user.authProject === config.url &&
      user.email?.toLowerCase() === identity.email,
    );
  }
  const canOpen = (user) => matches(authorized, user);
  const canAccept = (user) => candidate?.token === generation && matches(candidate, user);
  function lock() {
    authorized = null;
    candidate = null;
    window.HopperApp?.lock();
    byId("app-screen").classList.add("hidden");
    byId("auth-screen").classList.remove("hidden");
  }
  function controls() {
    document
      .querySelectorAll(
        "#login-form button[type=submit], #register-form button[type=submit], #mfa-form button[type=submit], #mfa-resend",
      )
      .forEach((button) => {
        button.disabled = busy || !configured;
      });
    for (const id of ["login-form", "register-form", "mfa-form"])
      byId(id).setAttribute("aria-busy", String(busy));
  }
  function feedback(key, target = "login-status", success = false) {
    feedbackKey = key;
    feedbackTarget = target;
    const message = byId(target);
    message.textContent = t(key);
    message.hidden = !key;
    message.dataset.kind = success ? "success" : "error";
    message.setAttribute("role", success ? "status" : "alert");
  }
  function clearSecret() {
    byId("mfa-qr").removeAttribute("src");
    byId("mfa-secret").value = "";
    byId("mfa-code").value = "";
    byId("mfa-code").removeAttribute("aria-invalid");
    byId("mfa-manual").open = false;
    byId("mfa-setup").hidden = true;
  }
  function stage(value) {
    phase = value;
    for (const id of ["login-form", "register-form", "mfa-form"])
      byId(id).classList.toggle(
        "active",
        id === (["mfa", "email"].includes(value) ? "mfa-form" : "login-form"),
      );
    byId("mfa-resend").hidden = value !== "email";
    byId("mfa-code-label").dataset.i18n =
      value === "email" ? "Codul primit pe email" : "Cod de autentificare";
    window.HopperI18n?.apply();
    if (["mfa", "email"].includes(value)) byId("mfa-code").focus();
    else if (value === "login") byId("login-email").focus();
  }
  function getClient() {
    if (!configured) throw Error("not-configured");
    if (!client) {
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          storageKey: `hopper_cloud_session:${config.url}`,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      client.auth.onAuthStateChange((event, next) => {
        if (event === "TOKEN_REFRESHED" && authorized) {
          let aal = null;
          try {
            aal = JSON.parse(
              atob(next.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
            ).aal;
          } catch {
            /* A malformed token cannot preserve access. */
          }
          if (
            aal !== "aal2" ||
            next?.user.id !== authorized.id ||
            next?.user.email?.toLowerCase() !== authorized.email
          ) {
            generation++;
            lock();
            clearSecret();
            stage("login");
            feedback("Sesiunea trebuie verificată din nou. Conectează-te.");
          }
        }
        if (event === "SIGNED_IN" && pendingUserId && next?.user.id !== pendingUserId) {
          generation++;
          lock();
          clearSecret();
          stage("login");
        }
        if (event === "SIGNED_OUT") {
          generation++;
          lock();
          clearSecret();
          stage("login");
        }
      });
    }
    return client;
  }
  function errorMessage(error) {
    if (error.message === "not-configured")
      return "Conectarea securizată nu este disponibilă momentan.";
    if (error.message === "different-account")
      return "Acest cont online nu corespunde contului salvat pe dispozitiv.";
    if (error.message === "storage") return "Datele nu au putut fi salvate. Încearcă din nou.";
    if (error.code === "invalid_credentials" || error.code === "invalid_login_credentials")
      return "Emailul sau parola este incorectă. Încearcă din nou.";
    if (error.code === "email_not_confirmed" || error.message === "email-unconfirmed")
      return "Confirmă emailul, apoi conectează-te din nou.";
    if (error.code === "otp_expired" || error.code === "otp_disabled")
      return "Codul de email este incorect sau a expirat. Verifică ultimul email sau retrimite codul.";
    if (error.code === "user_already_exists")
      return "Există deja un cont cu acest email. Conectează-te.";
    if (error.code === "weak_password") return "Alege o parolă de cel puțin 8 caractere.";
    if (error.status === 429 || error.code === "over_request_rate_limit")
      return "Prea multe încercări. Așteaptă puțin și încearcă din nou.";
    if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired")
      return "Codul este incorect sau a expirat. Introdu codul nou din Authenticator.";
    return "Conectarea nu a putut fi verificată. Verifică internetul și încearcă din nou.";
  }
  async function removeEnrollment(id = enrollFactor, required = false) {
    if (id && client) {
      try {
        const result = await client.auth.mfa.unenroll({ factorId: id });
        if (result.error && required) throw result.error;
      } catch (error) {
        if (required) throw error;
      }
    }
    if (id === enrollFactor) enrollFactor = null;
  }
  async function run(action, target = "login-status") {
    if (busy) return;
    busy = true;
    const token = ++generation;
    controls();
    feedback("", target);
    try {
      await action(token);
    } catch (error) {
      if (token === generation) {
        feedback(errorMessage(error), target);
        if (target === "mfa-status") {
          byId("mfa-code").setAttribute("aria-invalid", "true");
          byId("mfa-code").focus();
        }
      }
    } finally {
      if (token !== generation && client) {
        await removeEnrollment();
        try {
          await client.auth.signOut({ scope: "local" });
        } catch {
          /* Access stays locked. */
        }
      }
      busy = false;
      controls();
    }
  }
  async function validatedUser(token) {
    const result = await getClient().auth.getUser();
    if (result.error) throw result.error;
    if (token !== generation) return null;
    const user = result.data.user;
    if (!user?.id || !user.email) throw Error("invalid-session");
    if (
      (expectedEmail && user.email.toLowerCase() !== expectedEmail) ||
      (pendingUserId && user.id !== pendingUserId)
    )
      throw Error("different-account");
    if (!user.email_confirmed_at) throw Error("email-unconfirmed");
    return user;
  }
  async function finish(token) {
    const user = await validatedUser(token);
    if (!user) return;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (token !== generation) return;
    if (assurance.data.currentLevel !== "aal2") throw Error("mfa-required");
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    if (token !== generation) return;
    if (!factors.data.totp.some((factor) => factor.status === "verified"))
      throw Error("mfa-required");
    const app = window.HopperApp;
    if (!app) throw Error("app-unavailable");
    const email = user.email.toLowerCase();
    const existing = app.users().find((value) => value.email.toLowerCase() === email);
    if (
      existing?.authAccountId &&
      (existing.authAccountId !== user.id || existing.authProject !== config.url)
    )
      throw Error("different-account");
    if (
      existing?.cloudAccountId &&
      (existing.cloudAccountId !== user.id || existing.cloudProject !== config.url)
    )
      throw Error("different-account");
    const account = existing
      ? structuredClone(existing)
      : {
          name: user.user_metadata?.name || email.split("@")[0],
          email,
          expenses: [],
          incomes: [],
          currency: "RON",
        };
    account.authAccountId = user.id;
    account.authProject = config.url;
    candidate = { id: user.id, email, token };
    try {
      await app.acceptAuthenticated(account);
      if (token !== generation) {
        lock();
        return;
      }
      authorized = { id: user.id, email };
      candidate = null;
      pendingFactor = null;
      enrollFactor = null;
      clearSecret();
      feedback("");
      stage("ready");
      byId("login-password").value = "";
      byId("register-password").value = "";
      if (!app.openUser(account)) throw Error("app-unavailable");
    } catch {
      lock();
      throw Error("storage");
    }
  }
  async function requireFactor(token) {
    const user = await validatedUser(token);
    if (!user) return;
    pendingUserId = user.id;
    const result = await client.auth.mfa.listFactors();
    if (result.error) throw result.error;
    if (token !== generation) return;
    const verified = result.data.totp.find((factor) => factor.status === "verified");
    clearSecret();
    if (verified) {
      pendingFactor = verified.id;
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (token !== generation) return;
      if (assurance.data.currentLevel === "aal2") {
        await finish(token);
        return;
      }
      byId("mfa-heading").dataset.i18n = "Confirmă conectarea";
      byId("mfa-intro").dataset.i18n = "Introdu codul din Google sau Microsoft Authenticator.";
    } else {
      // Clean up only this app's unfinished factors, never an existing verified factor.
      for (const factor of result.data.all.filter(
        (factor) =>
          factor.factor_type === "totp" &&
          factor.status === "unverified" &&
          factor.friendly_name === "Hopper",
      )) {
        await removeEnrollment(factor.id, true);
        if (token !== generation) return;
      }
      const enrollment = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Hopper",
        issuer: "Hopper",
      });
      if (enrollment.error) throw enrollment.error;
      if (token !== generation) {
        await removeEnrollment(enrollment.data.id);
        return;
      }
      pendingFactor = enrollment.data.id;
      enrollFactor = pendingFactor;
      const qr = enrollment.data.totp.qr_code;
      byId("mfa-qr").src = qr.startsWith("<svg")
        ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr)
        : qr;
      byId("mfa-secret").value = enrollment.data.totp.secret;
      byId("mfa-setup").hidden = false;
      byId("mfa-heading").dataset.i18n = "Protejează-ți contul";
      byId("mfa-intro").dataset.i18n = "Adaugă Hopper în Authenticator, apoi introdu primul cod.";
    }
    feedback("", "mfa-status");
    stage("mfa");
  }
  function signIn({ email, password }) {
    return run(async (token) => {
      lock();
      expectedEmail = email.toLowerCase();
      pendingUserId = null;
      await removeEnrollment();
      const result = await getClient().auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });
      byId("login-password").value = "";
      if (token !== generation) return;
      if (result.error?.code === "email_not_confirmed") {
        confirmEmail();
        return;
      }
      if (result.error) throw result.error;
      if (!result.data.session) throw Error("invalid-session");
      await requireFactor(token);
    });
  }
  function confirmEmail() {
    clearSecret();
    byId("mfa-heading").dataset.i18n = "Confirmă emailul";
    byId("mfa-intro").dataset.i18n = "Introdu codul de confirmare primit pe email.";
    stage("email");
    feedback("Introdu codul de confirmare primit pe email.", "mfa-status", true);
  }
  function register({ name, email, password }) {
    return run(async (token) => {
      lock();
      expectedEmail = email.toLowerCase();
      pendingUserId = null;
      const result = await getClient().auth.signUp({
        email: email.toLowerCase(),
        password,
        options: { data: { name } },
      });
      byId("register-password").value = "";
      if (result.error) throw result.error;
      if (token !== generation) return;
      if (result.data.session) await requireFactor(token);
      else {
        byId("login-email").value = email;
        confirmEmail();
      }
    }, "register-status");
  }
  function verify() {
    const code = byId("mfa-code").value.trim();
    if (!/^\d{6}$/.test(code)) {
      feedback(
        phase === "email"
          ? "Introdu codul de 6 cifre primit pe email."
          : "Introdu codul de 6 cifre din Authenticator.",
        "mfa-status",
      );
      byId("mfa-code").setAttribute("aria-invalid", "true");
      byId("mfa-code").focus();
      return Promise.resolve();
    }
    return run(async (token) => {
      if (phase === "email") {
        const result = await getClient().auth.verifyOtp({
          email: expectedEmail,
          token: code,
          type: "email",
        });
        byId("mfa-code").value = "";
        if (result.error) throw result.error;
        if (token !== generation) return;
        if (!result.data.session) throw Error("invalid-session");
        await requireFactor(token);
        return;
      }
      if (phase !== "mfa" || !pendingFactor) throw Error("mfa-required");
      const result = await getClient().auth.mfa.challengeAndVerify({
        factorId: pendingFactor,
        code,
      });
      byId("mfa-code").value = "";
      if (result.error) throw result.error;
      if (token !== generation) return;
      await finish(token);
    }, "mfa-status");
  }
  function resend() {
    if (phase !== "email" || !expectedEmail) return Promise.resolve();
    return run(async (token) => {
      const result = await getClient().auth.resend({ type: "signup", email: expectedEmail });
      if (result.error) throw result.error;
      if (token === generation)
        feedback(
          "Codul de confirmare a fost retrimis. Verifică și dosarul Spam.",
          "mfa-status",
          true,
        );
    }, "mfa-status");
  }
  async function cancel() {
    generation++;
    lock();
    clearSecret();
    pendingFactor = null;
    pendingUserId = null;
    expectedEmail = null;
    feedback("");
    stage("login");
    localStorage.removeItem("expenses_current_user");
    window.HopperPersistence?.schedule();
    if (!busy && client) {
      busy = true;
      controls();
      await removeEnrollment();
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        /* Explicit logout remains local. */
      }
      busy = false;
      controls();
    }
  }
  function resume() {
    if (!configured) {
      feedback("Conectarea securizată nu este disponibilă momentan.");
      controls();
      return Promise.resolve();
    }
    return run(async (token) => {
      lock();
      const previous = localStorage.getItem("expenses_current_user");
      if (!previous) return;
      const account = JSON.parse(previous);
      expectedEmail = account.email?.toLowerCase();
      pendingUserId = account.authAccountId || null;
      const result = await getClient().auth.getSession();
      if (result.error) throw result.error;
      if (token !== generation || !result.data.session) return;
      await requireFactor(token);
    });
  }
  byId("mfa-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void verify();
  });
  byId("mfa-resend").addEventListener("click", () => void resend());
  byId("mfa-cancel").addEventListener("click", () => void cancel());
  byId("mfa-code").addEventListener("input", () => {
    byId("mfa-code").removeAttribute("aria-invalid");
    feedback("", "mfa-status");
  });
  byId("mfa-copy").addEventListener("click", async () => {
    const secret = byId("mfa-secret");
    try {
      await navigator.clipboard.writeText(secret.value);
      feedback("Cheia a fost copiată. Adaug-o în Authenticator.", "mfa-status", true);
    } catch {
      secret.focus();
      secret.select();
      feedback("Selectează cheia și copiaz-o în Authenticator.", "mfa-status", true);
    }
  });
  const onLogout = () => void cancel();
  const onLanguage = () => {
    if (feedbackKey)
      feedback(feedbackKey, feedbackTarget, byId(feedbackTarget).dataset.kind === "success");
  };
  document.addEventListener("hopper:logout", onLogout);
  document.addEventListener("hopper:language", onLanguage);
  window.HopperAuth = {
    canOpen,
    canAccept,
    getClient,
    signIn,
    register,
    verify,
    resend,
    cancel,
    resume,
    dispose() {
      generation++;
      lock();
      clearSecret();
      document.removeEventListener("hopper:logout", onLogout);
      document.removeEventListener("hopper:language", onLanguage);
      client?.auth.stopAutoRefresh();
    },
  };
  controls();
})();
