(() => {
  "use strict";
  const config = window.HopperCloudConfig || {};
  const t = (key, values = []) =>
    window.HopperI18n?.t(key, values) || key.replace(/\{(\d+)\}/g, (_, i) => values[i] ?? "");
  const byId = (id) => document.getElementById(id);
  const configured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);
  let client = null,
    authorized = null,
    candidate = null;
  let expectedEmail = null,
    pendingUserId = null,
    request = null;
  let busy = false,
    generation = 0,
    phase = "login";
  let feedbackKey = "",
    feedbackTarget = "login-status",
    resendAt = 0,
    timer = null;
  const emailMethods = ["password", "otp", "email/signup"];
  const formIds = [
    "login-form",
    "register-form",
    "recovery-form",
    "email-code-form",
    "reset-password-form",
  ];
  let recoveryIdentity = null,
    signingOut = false;

  function claims(session) {
    try {
      const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))),
      );
    } catch {
      return null;
    }
  }
  function hasVerifiedMethod(session) {
    const value = claims(session);
    return Boolean(
      value?.role === "authenticated" &&
      value.email &&
      value.is_anonymous === false &&
      Array.isArray(value.amr) &&
      value.amr.some((entry) => emailMethods.includes(entry.method)),
    );
  }
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
  function clearCode() {
    byId("email-code").value = "";
    byId("email-code").removeAttribute("aria-invalid");
  }
  function clearPasswords() {
    for (const id of [
      "login-password",
      "register-password",
      "reset-password",
      "reset-password-confirm",
    ])
      byId(id).value = "";
  }
  async function signOutLocal() {
    signingOut = true;
    try {
      await client.auth.signOut({ scope: "local" });
    } finally {
      signingOut = false;
    }
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }
  function controls() {
    byId("auth-service-status").hidden = configured;
    document
      .querySelectorAll(formIds.map((id) => "#" + id + " button[type=submit]").join(","))
      .forEach((button) => {
        button.disabled =
          busy ||
          (!configured &&
            ["email-code-form", "reset-password-form"].includes(button.closest("form")?.id));
      });
    for (const id of formIds) byId(id).setAttribute("aria-busy", String(busy));
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    byId("email-code-resend").disabled = busy || !configured || seconds > 0;
    byId("email-code-resend").textContent =
      seconds > 0 ? t("Retrimite codul în {0}s", [seconds]) : t("Retrimite codul");
  }
  function startCooldown() {
    resendAt = Date.now() + 60000;
    stopTimer();
    timer = setInterval(() => {
      controls();
      if (Date.now() >= resendAt) stopTimer();
    }, 1000);
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
  function stage(value) {
    phase = value;
    for (const id of formIds)
      byId(id).classList.toggle(
        "active",
        id ===
          {
            code: "email-code-form",
            recovery: "recovery-form",
            reset: "reset-password-form",
            register: "register-form",
            login: "login-form",
          }[value],
      );
    if (value !== "code") stopTimer();
    byId("email-code-address").textContent = value === "code" ? expectedEmail : "";
    window.HopperI18n?.apply();
    controls();
    if (value === "code") byId("email-code").focus();
    else if (value === "reset") byId("reset-password").focus();
    else if (value === "recovery") byId("recovery-email").focus();
    else if (value === "login") byId("login-email").focus();
  }
  function invalidate() {
    generation++;
    lock();
    clearCode();
    request = null;
    recoveryIdentity = null;
    clearPasswords();
    expectedEmail = null;
    pendingUserId = null;
    stage("login");
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
        if (event === "SIGNED_OUT" && !signingOut) invalidate();
        if (["SIGNED_IN", "TOKEN_REFRESHED"].includes(event) && authorized) {
          if (
            !hasVerifiedMethod(next) ||
            next?.user.id !== authorized.id ||
            next?.user.email?.toLowerCase() !== authorized.email
          ) {
            invalidate();
            feedback("Sesiunea trebuie verificată din nou. Conectează-te.");
          }
        }
        if (event === "SIGNED_IN" && pendingUserId && next?.user.id !== pendingUserId) invalidate();
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
    if (error.message === "email-code-required")
      return "Conectează-te din nou cu emailul și parola.";
    if (error.code === "email_not_confirmed") return "Confirmă emailul folosind codul primit.";
    if (error.code === "weak_password")
      return "Alege o parolă mai puternică, de minimum 8 caractere.";
    if (error.code === "same_password") return "Alege o parolă diferită de cea veche.";
    if (error.code === "user_already_exists")
      return "Există deja un cont cu acest email. Intră în cont.";
    if (error.message === "email-unconfirmed")
      return "Emailul nu a fost confirmat. Cere un cod nou.";
    if (error.code === "invalid_credentials" && phase !== "code")
      return "Emailul sau parola sunt incorecte. Verifică-le sau creează un cont.";
    if (error.code === "otp_expired" || error.code === "invalid_credentials")
      return "Codul de email este incorect sau a expirat. Verifică ultimul email sau retrimite codul.";
    if (["otp_disabled", "signup_disabled", "user_not_found"].includes(error.code))
      return "Nu am putut trimite codul. Verifică adresa sau creează un cont.";
    if (
      error.status === 429 ||
      ["over_request_rate_limit", "over_email_send_rate_limit"].includes(error.code)
    )
      return "Prea multe încercări. Așteaptă puțin și încearcă din nou.";
    if (error.code === "email_address_not_authorized")
      return "Trimiterea emailurilor nu este disponibilă momentan. Încearcă mai târziu.";
    return "Conectarea nu a putut fi verificată. Verifică internetul și încearcă din nou.";
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
        if (target === "email-code-status" && phase === "code") {
          byId("email-code").setAttribute("aria-invalid", "true");
          byId("email-code").focus();
        }
      }
    } finally {
      if (token !== generation && client) {
        try {
          await signOutLocal();
        } catch {
          /* Access stays locked after cancellation. */
        }
      }
      busy = false;
      controls();
    }
  }
  async function validatedUser(token, requireMethod = true) {
    const stored = await getClient().auth.getSession();
    if (stored.error) throw stored.error;
    if (token !== generation) return null;
    const session = stored.data.session;
    if (!session?.access_token) throw Error("invalid-session");
    // Validate this exact token on the server before trusting its identity.
    const result = await client.auth.getUser(session.access_token);
    if (result.error) throw result.error;
    if (token !== generation) return null;
    const user = result.data.user;
    const payload = claims(session);
    if (
      !user?.id ||
      !user.email ||
      payload?.sub !== user.id ||
      payload.email?.toLowerCase() !== user.email.toLowerCase()
    )
      throw Error("invalid-session");
    if (!user.email_confirmed_at || user.is_anonymous) throw Error("email-unconfirmed");
    if (requireMethod && !hasVerifiedMethod(session)) throw Error("email-code-required");
    if (
      (expectedEmail && user.email.toLowerCase() !== expectedEmail) ||
      (pendingUserId && user.id !== pendingUserId)
    )
      throw Error("different-account");
    pendingUserId = user.id;
    return user;
  }
  async function finish(token) {
    const user = await validatedUser(token);
    if (!user) return;
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
      request = null;
      clearCode();
      feedback("");
      stage("ready");
      if (!app.openUser(account)) throw Error("app-unavailable");
    } catch {
      lock();
      throw Error("storage");
    }
  }
  function validEmail(email, target) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      feedback("Introdu o adresă de email validă.", target);
      return null;
    }
    return normalized;
  }
  async function sendCode() {
    return request.kind === "recovery"
      ? getClient().auth.resetPasswordForEmail(request.email)
      : getClient().auth.resend({ type: "signup", email: request.email });
  }
  function showCode() {
    startCooldown();
    stage("code");
    feedback("Verifică emailul și dosarul Spam pentru cod.", "email-code-status", true);
  }
  const signIn = ({ email, password }) => {
    const normalized = validEmail(email, "login-status");
    if (!normalized) return Promise.resolve();
    if (!password) {
      feedback("Completează parola.");
      return Promise.resolve();
    }
    return run(async (token) => {
      lock();
      expectedEmail = normalized;
      pendingUserId = null;
      recoveryIdentity = null;
      clearPasswords();
      const result = await getClient().auth.signInWithPassword({ email: normalized, password });
      if (token !== generation) return;
      if (result.error?.code === "email_not_confirmed") {
        request = { kind: "signup", email: normalized };
        const sent = await sendCode();
        if (sent.error) throw sent.error;
        if (token === generation) showCode();
        return;
      }
      if (result.error) throw result.error;
      if (!result.data.session) throw Error("invalid-session");
      await finish(token);
    });
  };
  const register = ({ name, email, password }) => {
    if (!name?.trim()) {
      feedback("Completează numele.", "register-status");
      return Promise.resolve();
    }
    const normalized = validEmail(email, "register-status");
    if (!normalized) return Promise.resolve();
    if (!password || password.length < 8) {
      feedback("Alege o parolă de minimum 8 caractere.", "register-status");
      return Promise.resolve();
    }
    return run(async (token) => {
      lock();
      expectedEmail = normalized;
      pendingUserId = null;
      recoveryIdentity = null;
      clearPasswords();
      const result = await getClient().auth.signUp({
        email: normalized,
        password,
        options: { data: { name: name.trim() } },
      });
      if (result.error) throw result.error;
      if (token !== generation) return;
      if (result.data.session) await finish(token);
      else {
        request = { kind: "signup", email: normalized };
        showCode();
      }
    }, "register-status");
  };
  function startRecovery() {
    const email = byId("login-email").value.trim();
    invalidate();
    feedback("");
    byId("recovery-email").value = email;
    stage("recovery");
  }
  function recover() {
    const email = validEmail(byId("recovery-email").value, "recovery-status");
    if (!email) return Promise.resolve();
    return run(async (token) => {
      lock();
      localStorage.removeItem("expenses_current_user");
      window.HopperPersistence?.schedule();
      expectedEmail = email;
      pendingUserId = null;
      recoveryIdentity = null;
      request = { kind: "recovery", email };
      const result = await sendCode();
      if (result.error) throw result.error;
      if (token === generation) showCode();
    }, "recovery-status");
  }
  function savePassword() {
    const password = byId("reset-password").value;
    const confirmation = byId("reset-password-confirm").value;
    if (password.length < 8) {
      feedback("Alege o parolă de minimum 8 caractere.", "reset-password-status");
      return Promise.resolve();
    }
    if (password !== confirmation) {
      feedback("Parolele nu coincid.", "reset-password-status");
      return Promise.resolve();
    }
    return run(async (token) => {
      if (phase !== "reset" || !recoveryIdentity) throw Error("invalid-session");
      const user = await validatedUser(token, false);
      if (!user || token !== generation) return;
      if (user.id !== recoveryIdentity.id || user.email.toLowerCase() !== recoveryIdentity.email)
        throw Error("different-account");
      clearPasswords();
      const result = await getClient().auth.updateUser({ password });
      if (result.error) throw result.error;
      if (token !== generation) return;
      localStorage.removeItem("expenses_current_user");
      window.HopperPersistence?.schedule();
      await signOutLocal();
      if (token !== generation) return;
      request = null;
      recoveryIdentity = null;
      expectedEmail = null;
      pendingUserId = null;
      clearCode();
      stage("login");
      feedback("Parola a fost schimbată. Intră în cont cu noua parolă.", "login-status", true);
    }, "reset-password-status");
  }
  function switchForm(id) {
    if (!["login-form", "register-form"].includes(id)) return;
    invalidate();
    feedback("");
    stage(id === "register-form" ? "register" : "login");
  }
  function verify() {
    if (busy) return Promise.resolve();
    const code = byId("email-code").value.trim();
    if (!/^\d{6}$/.test(code)) {
      feedback("Introdu codul de 6 cifre primit pe email.", "email-code-status");
      byId("email-code").setAttribute("aria-invalid", "true");
      byId("email-code").focus();
      return Promise.resolve();
    }
    return run(async (token) => {
      if (phase !== "code" || !expectedEmail) throw Error("email-code-required");
      const result = await getClient().auth.verifyOtp({
        email: expectedEmail,
        token: code,
        type: request?.kind === "recovery" ? "recovery" : "email",
      });
      clearCode();
      if (result.error) throw result.error;
      if (token !== generation) return;
      if (!result.data.session) throw Error("invalid-session");
      if (request?.kind === "recovery") {
        const user = await validatedUser(token, false);
        if (!user || token !== generation) return;
        recoveryIdentity = { id: user.id, email: user.email.toLowerCase() };
        stage("reset");
        feedback("", "reset-password-status");
      } else await finish(token);
    }, "email-code-status");
  }
  function resend() {
    if (phase !== "code" || !request || Date.now() < resendAt) return Promise.resolve();
    return run(async (token) => {
      const result = await sendCode();
      if (result.error) throw result.error;
      if (token !== generation) return;
      clearCode();
      startCooldown();
      feedback("Codul a fost retrimis. Verifică și dosarul Spam.", "email-code-status", true);
    }, "email-code-status");
  }
  async function cancel() {
    invalidate();
    feedback("");
    localStorage.removeItem("expenses_current_user");
    window.HopperPersistence?.schedule();
    if (!busy && client) {
      busy = true;
      controls();
      try {
        await signOutLocal();
      } catch {
        /* Explicit logout remains local. */
      }
      busy = false;
      controls();
    }
  }
  function resume() {
    if (!configured) {
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
      await finish(token);
    });
  }
  byId("forgot-password").addEventListener("click", startRecovery);
  byId("recovery-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void recover();
  });
  byId("reset-password-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void savePassword();
  });
  for (const id of ["recovery-cancel", "reset-password-cancel"])
    byId(id).addEventListener("click", () => void cancel());
  byId("email-code-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void verify();
  });
  byId("email-code-resend").addEventListener("click", () => void resend());
  byId("email-code-cancel").addEventListener("click", () => void cancel());
  byId("email-code").addEventListener("input", () => {
    byId("email-code").removeAttribute("aria-invalid");
    feedback("", "email-code-status");
  });
  const onLogout = () => void cancel();
  const onLanguage = () => {
    if (feedbackKey)
      feedback(feedbackKey, feedbackTarget, byId(feedbackTarget).dataset.kind === "success");
    controls();
  };
  document.addEventListener("hopper:logout", onLogout);
  document.addEventListener("hopper:language", onLanguage);
  window.HopperAuth = {
    canOpen,
    canAccept,
    getClient,
    signIn,
    register,
    switchForm,
    startRecovery,
    recover,
    savePassword,
    verify,
    resend,
    cancel,
    resume,
    dispose() {
      generation++;
      lock();
      clearCode();
      clearPasswords();
      stopTimer();
      document.removeEventListener("hopper:logout", onLogout);
      document.removeEventListener("hopper:language", onLanguage);
      client?.auth.stopAutoRefresh();
    },
  };
  controls();
})();
