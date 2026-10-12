/* eslint-disable @typescript-eslint/no-explicit-any -- Mock the untyped standalone Supabase bridge. */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appScripts } from "../mobile/resources.mjs";

const html = readFileSync("mobile/app/index.html", "utf8");
const source = readFileSync("mobile/app/auth.js", "utf8");
const financial = readFileSync("mobile/app/script.js", "utf8");
const win = window as unknown as Record<string, any>;
const email = "student@example.test";
const password = "new-test-password";
const legacy = {
  email,
  name: "Ana",
  password: "legacy-only",
  currency: "EUR",
  customField: "keep",
  profilePhoto: "data:image/jpeg;base64,cGhvdG8=",
  expenses: [
    { amount: 42, currency: "EUR", category: "Food", description: "Existing", date: "2026-10-01" },
  ],
  incomes: [{ amount: 100, currency: "EUR", source: "Bursă", date: "2026-10-01" }],
};
const serverUser = {
  id: "account-a",
  email,
  email_confirmed_at: "2026-10-08T00:00:00Z",
  is_anonymous: false,
  user_metadata: { name: "Ana" },
};
const value = (id: string) => document.getElementById(id) as HTMLInputElement;
const auth = () => win["HopperAuth"];
const locked = () => expect(document.getElementById("app-screen")).toHaveClass("hidden");
const opened = () => expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
const codeVisible = () => expect(document.getElementById("email-code-form")).toHaveClass("active");
function token(user: any = serverUser, methods = ["password"]) {
  return (
    "header." +
    btoa(
      JSON.stringify({
        role: "authenticated",
        sub: user.id,
        email: user.email,
        is_anonymous: false,
        amr: methods.map((method) => ({ method, timestamp: 1791493200 })),
      }),
    ) +
    ".signature"
  );
}
function fakeCloud() {
  let user = structuredClone(serverUser),
    session: any = null;
  let codeType = "signup";
  const listeners: Array<(event: string, session: any) => void> = [];
  const notify = (event: string) => listeners.forEach((callback) => callback(event, session));
  const makeSession = (methods = ["password"]) => ({ user, access_token: token(user, methods) });
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        listeners.push(callback);
        return { data: {} };
      }),
      getSession: vi.fn(async (): Promise<any> => ({ data: { session }, error: null })),
      getUser: vi.fn(async (): Promise<any> => ({ data: { user }, error: null })),
      signInWithOAuth: vi.fn(async (input: any): Promise<any> => {
        const url = new URL("https://project.supabase.co/auth/v1/authorize");
        url.searchParams.set("provider", "google");
        url.searchParams.set("redirect_to", input.options.redirectTo);
        url.searchParams.set("code_challenge", "x".repeat(43));
        url.searchParams.set("code_challenge_method", "s256");
        return { data: { url: url.href }, error: null };
      }),
      exchangeCodeForSession: vi.fn(async (): Promise<any> => {
        session = makeSession(["oauth"]);
        notify("SIGNED_IN");
        return { data: { session }, error: null };
      }),
      signInWithPassword: vi.fn(async (): Promise<any> => {
        session = makeSession();
        notify("SIGNED_IN");
        return { data: { user, session }, error: null };
      }),
      signUp: vi.fn(async (input: any): Promise<any> => {
        user.user_metadata = input.options.data;
        codeType = "signup";
        return { data: { user, session: null }, error: null };
      }),
      resend: vi.fn(async (): Promise<any> => ({ data: {}, error: null })),
      resetPasswordForEmail: vi.fn(async (): Promise<any> => {
        codeType = "recovery";
        return { data: {}, error: null };
      }),
      verifyOtp: vi.fn(async (): Promise<any> => {
        session = makeSession([codeType === "recovery" ? "otp" : "email/signup"]);
        notify(codeType === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN");
        return { data: { user, session }, error: null };
      }),
      updateUser: vi.fn(async (): Promise<any> => ({ data: { user }, error: null })),
      signOut: vi.fn(async () => {
        session = null;
        notify("SIGNED_OUT");
        return { error: null };
      }),
      stopAutoRefresh: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return {
    client,
    sdk: { createClient: vi.fn((_url?: string, _key?: string, _options?: any) => client) },
    restore(methods = ["password"]) {
      session = makeSession(methods);
    },
    changeUser(next: any) {
      user = next;
    },
    refresh(methods = ["password"]) {
      session = makeSession(methods);
      notify("TOKEN_REFRESHED");
    },
    signOut() {
      session = null;
      notify("SIGNED_OUT");
    },
  };
}
async function boot(cloud = fakeCloud(), configured = true, user: any = legacy, attempt?: any) {
  localStorage.clear();
  if (user) {
    localStorage.setItem("expenses_users", JSON.stringify([user]));
    localStorage.setItem("expenses_current_user", JSON.stringify(user));
  }
  if (attempt)
    localStorage.setItem(
      "hopper_google_attempt:https://project.supabase.co",
      JSON.stringify(attempt),
    );
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    dialog.close = vi.fn(() => {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    });
    dialog.showModal = vi.fn(() => {
      dialog.open = true;
    });
  });
  win["HopperCloudConfig"] = configured
    ? { url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }
    : {};
  win["supabase"] = cloud.sdk;
  new Function(source)();
  new Function(financial)();
  await vi.waitFor(() =>
    expect(document.getElementById("login-form")).toHaveAttribute("aria-busy", "false"),
  );
  return cloud;
}
const signIn = () => auth().signIn({ email, password });
const register = () => auth().register({ name: "Ana", email, password });
async function verify(code = "123456") {
  value("email-code").value = code;
  await auth().verify();
}
async function recover() {
  auth().startRecovery();
  value("recovery-email").value = email;
  await auth().recover();
}
async function reset(next = "changed-test-password", confirmation = next) {
  value("reset-password").value = next;
  value("reset-password-confirm").value = confirmation;
  await auth().savePassword();
}
afterEach(() => {
  auth()?.dispose();
  win["HopperApp"]?.dispose();
  for (const key of [
    "HopperAuth",
    "HopperApp",
    "HopperCloudConfig",
    "HopperPersistence",
    "HopperOAuth",
    "supabase",
  ])
    delete win[key];
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

describe("Compatibility with existing email/password sessions and recovery", () => {
  it("keeps local records locked without configuration and leaves an actionable warning", async () => {
    const cloud = await boot(undefined, false);
    const before = localStorage.getItem("expenses_users");
    value("login-email").value = email;
    value("login-password").value = password;
    document.querySelector<HTMLButtonElement>("#login-form button[type=submit]")!.click();
    await vi.waitFor(() =>
      expect(value("login-status").textContent).toContain("nu este disponibilă"),
    );
    expect(document.getElementById("auth-service-status")!.hidden).toBe(false);
    expect(cloud.sdk.createClient).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    locked();
  });

  it("uses the requested placeholders and retains login and password recovery controls", async () => {
    await boot();
    for (const id of ["login-email", "register-email", "recovery-email"])
      expect(value(id)).toHaveAttribute("placeholder", "Introdu email");
    for (const id of [
      "login-password",
      "register-password",
      "reset-password",
      "reset-password-confirm",
    ])
      expect(value(id)).toHaveAttribute("placeholder", "Introdu parola");
    expect(document.querySelector("#login-form button[type=submit]")?.textContent).toBe(
      "Intră în cont",
    );
    expect(value("forgot-password").textContent).toBe("Ai uitat parola?");
  });

  it("validates missing email, malformed email and missing password without server calls", async () => {
    const cloud = await boot();
    const form = document.getElementById("login-form")!;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(value("login-status").textContent).toContain("Completează emailul");
    value("login-email").value = "invalid";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(value("login-status").textContent).toContain("email validă");
    value("login-email").value = email;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(value("login-status").textContent).toContain("Completează parola");
    expect(cloud.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("normalizes email but preserves password characters and validates the session on the server", async () => {
    const cloud = await boot();
    value("login-email").value = "Student@Example.test";
    value("login-password").value = " password with spaces ";
    document.querySelector<HTMLButtonElement>("#login-form button[type=submit]")!.click();
    await vi.waitFor(opened);
    expect(cloud.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email,
      password: " password with spaces ",
    });
    expect(cloud.client.auth.getUser).toHaveBeenCalledWith(token());
    expect(value("login-password").value).toBe("");
    expect([...Object.values(localStorage)].join()).not.toContain("password with spaces");
    expect(cloud.client.rpc).not.toHaveBeenCalled();
  });

  it("preserves existing financial records, photos and unrelated fields after login", async () => {
    await boot();
    await signIn();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)[0]).toEqual({
      ...legacy,
      authMethod: "email",
      authAccountId: "account-a",
      authProject: "https://project.supabase.co",
    });
    opened();
  });

  it.each([
    [{ code: "invalid_credentials" }, "Emailul sau parola sunt incorecte"],
    [{ message: "offline" }, "Verifică internetul"],
    [{ code: "over_request_rate_limit", status: 429 }, "Prea multe"],
  ])("shows login errors without opening the account (%o)", async (error, expected) => {
    const cloud = await boot();
    cloud.client.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error });
    await signIn();
    expect(value("login-status").textContent).toContain(expected);
    locked();
  });

  it.each([
    [{ name: "", email, password }, "Completează numele"],
    [{ name: "Ana", email: "", password }, "email validă"],
    [{ name: "Ana", email, password: "" }, "minimum 8"],
    [{ name: "Ana", email, password: "short" }, "minimum 8"],
  ])("validates registration before sending credentials (%o)", async (input, expected) => {
    const cloud = await boot();
    await auth().register(input);
    expect(value("register-status").textContent).toContain(expected);
    expect(cloud.client.auth.signUp).not.toHaveBeenCalled();
    locked();
  });

  it("registers online and creates no local account until email confirmation", async () => {
    const cloud = await boot(undefined, true, null);
    document.querySelector<HTMLButtonElement>('[data-target="register-form"]')!.click();
    value("register-name").value = "Ana";
    value("register-email").value = email;
    value("register-password").value = password;
    document.querySelector<HTMLButtonElement>("#register-form button[type=submit]")!.click();
    await vi.waitFor(codeVisible);
    expect(cloud.client.auth.signUp).toHaveBeenCalledWith({
      email,
      password,
      options: { data: { name: "Ana" } },
    });
    expect(value("register-password").value).toBe("");
    expect(localStorage.getItem("expenses_users")).toBeNull();
    await verify("012345");
    expect(cloud.client.auth.verifyOtp).toHaveBeenCalledWith({
      email,
      token: "012345",
      type: "email",
    });
    const stored = JSON.parse(localStorage.getItem("expenses_users")!)[0];
    expect(stored.name).toBe("Ana");
    expect(stored.password).toBeUndefined();
    opened();
  });

  it("accepts immediate signup only after the returned session is verified", async () => {
    const cloud = await boot(undefined, true, null);
    cloud.client.auth.signUp.mockImplementationOnce(async () => {
      cloud.restore(["password"]);
      return { data: { session: { access_token: token() } }, error: null };
    });
    await register();
    opened();
    expect(cloud.client.auth.getUser).toHaveBeenCalledWith(token());
  });

  it("offers a fresh confirmation code when login reports an unconfirmed email", async () => {
    const cloud = await boot();
    cloud.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { code: "email_not_confirmed" },
    });
    await signIn();
    expect(cloud.client.auth.resend).toHaveBeenCalledWith({ type: "signup", email });
    codeVisible();
    locked();
  });

  it.each(["", "123", "abcdef", "1234567"])("rejects malformed codes (%s)", async (code) => {
    const cloud = await boot();
    await register();
    await verify(code);
    expect(cloud.client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(value("email-code")).toHaveAttribute("aria-invalid", "true");
    locked();
  });

  it("keeps expired confirmation codes locked and permits retry", async () => {
    const cloud = await boot();
    await register();
    cloud.client.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: "otp_expired" } });
    await verify();
    locked();
    codeVisible();
    expect(value("email-code-status").textContent).toContain("a expirat");
    await verify("654321");
    opened();
  });

  it("resends confirmation only after the cooldown and never retains the password", async () => {
    const cloud = await boot();
    vi.useFakeTimers();
    await register();
    await auth().resend();
    expect(cloud.client.auth.resend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);
    await auth().resend();
    expect(cloud.client.auth.resend).toHaveBeenCalledWith({ type: "signup", email });
    expect(cloud.client.auth.signUp).toHaveBeenCalledTimes(1);
    locked();
  });

  it("opens recovery from the visible link and lets the user correct the email", async () => {
    await boot();
    value("login-email").value = email;
    value("forgot-password").click();
    expect(value("recovery-email").value).toBe(email);
    expect(value("recovery-form")).toHaveClass("active");
    value("recovery-cancel").click();
    expect(value("google-form")).toHaveClass("active");
    locked();
  });

  it("does not send recovery requests for invalid email addresses", async () => {
    const cloud = await boot();
    auth().startRecovery();
    value("recovery-email").value = "invalid";
    await auth().recover();
    expect(value("recovery-status").textContent).toContain("email validă");
    expect(cloud.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("verifies recovery proof without opening or modifying financial accounts", async () => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    await recover();
    expect(cloud.client.auth.resetPasswordForEmail).toHaveBeenCalledWith(email);
    await verify();
    expect(cloud.client.auth.verifyOtp).toHaveBeenCalledWith({
      email,
      token: "123456",
      type: "recovery",
    });
    expect(value("reset-password-form")).toHaveClass("active");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    expect(cloud.client.auth.updateUser).not.toHaveBeenCalled();
    locked();
  });

  it.each([
    [{ code: "email_address_not_authorized" }, "Trimiterea emailurilor"],
    [{ status: 429 }, "Prea multe"],
    [{ message: "offline" }, "Verifică internetul"],
  ])("shows recovery send failures and keeps records intact (%o)", async (error, expected) => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    cloud.client.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error });
    await recover();
    expect(value("recovery-status").textContent).toContain(expected);
    expect(localStorage.getItem("expenses_users")).toBe(before);
    locked();
  });

  it("resends the recovery type after 60 seconds, without sending signup emails", async () => {
    const cloud = await boot();
    vi.useFakeTimers();
    await recover();
    await auth().resend();
    expect(cloud.client.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    await auth().resend();
    expect(cloud.client.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    expect(cloud.client.auth.resend).not.toHaveBeenCalled();
  });

  it("requires recovery verification before changing a password", async () => {
    const cloud = await boot();
    await reset();
    expect(cloud.client.auth.updateUser).not.toHaveBeenCalled();
    locked();
  });

  it("validates password length and matching confirmation", async () => {
    const cloud = await boot();
    await recover();
    await verify();
    await reset("short");
    expect(value("reset-password-status").textContent).toContain("minimum 8");
    await reset("changed-test-password", "different");
    expect(value("reset-password-status").textContent).toContain("nu coincid");
    expect(cloud.client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password only online and returns to login with styled success feedback", async () => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    await recover();
    await verify();
    await reset();
    expect(cloud.client.auth.updateUser).toHaveBeenCalledWith({
      password: "changed-test-password",
    });
    expect(value("login-form")).toHaveClass("active");
    expect(value("login-status").textContent).toContain("Parola a fost schimbată");
    expect(value("login-status")).toHaveAttribute("data-kind", "success");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    expect([...Object.values(localStorage)].join()).not.toContain("changed-test-password");
    expect(value("reset-password").value).toBe("");
    expect(value("reset-password-confirm").value).toBe("");
    expect(cloud.client.auth.signOut).toHaveBeenCalled();
    locked();
  });

  it("does not change a password when the recovery identity changes or the server fails", async () => {
    const cloud = await boot();
    await recover();
    await verify();
    cloud.client.auth.getUser.mockRejectedValueOnce(new Error("offline"));
    await reset();
    expect(cloud.client.auth.updateUser).not.toHaveBeenCalled();
    cloud.changeUser({ ...serverUser, id: "other", email: "other@example.test" });
    await reset();
    expect(cloud.client.auth.updateUser).not.toHaveBeenCalled();
    locked();
  });

  it("leaves failed password updates in recovery without opening the account", async () => {
    const cloud = await boot();
    await recover();
    await verify();
    cloud.client.auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: { code: "same_password" },
    });
    await reset();
    expect(value("reset-password-form")).toHaveClass("active");
    expect(value("reset-password-status").textContent).toContain("diferită");
    locked();
  });

  it("ignores login that completes after cancellation without modifying account records", async () => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    let done!: (value: any) => void;
    const actual = cloud.client.auth.signInWithPassword.getMockImplementation()!;
    cloud.client.auth.signInWithPassword.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const pending = signIn();
    await auth().cancel();
    done(await actual());
    await pending;
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    locked();
  });

  it("ignores recovery verification that completes after cancellation", async () => {
    const cloud = await boot();
    await recover();
    let done!: (value: any) => void;
    const actual = cloud.client.auth.verifyOtp.getMockImplementation()!;
    cloud.client.auth.verifyOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    value("email-code").value = "123456";
    const pending = auth().verify();
    await auth().cancel();
    done(await actual());
    await pending;
    expect(value("reset-password-form")).not.toHaveClass("active");
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    locked();
  });

  it("serializes repeated login submissions", async () => {
    const cloud = await boot();
    let done!: (value: any) => void;
    cloud.client.auth.signInWithPassword.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const pending = signIn();
    await signIn();
    expect(cloud.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    done({ data: {}, error: { code: "invalid_credentials" } });
    await pending;
  });

  it("requires a server-validated confirmed identity after password login", async () => {
    const cloud = await boot();
    cloud.client.auth.getUser.mockResolvedValueOnce({
      data: { user: { ...serverUser, email_confirmed_at: null } },
      error: null,
    });
    await signIn();
    locked();
    cloud.client.auth.getUser.mockRejectedValueOnce(new Error("offline"));
    await signIn();
    locked();
    cloud.changeUser({ ...serverUser, id: "other", email: "other@example.test" });
    await signIn();
    locked();
  });

  it.each([
    { authAccountId: "other", authProject: "https://project.supabase.co" },
    { authAccountId: "account-a", authProject: "https://other.supabase.co" },
    { cloudAccountId: "other", cloudProject: "https://project.supabase.co" },
  ])("does not overwrite records bound to another identity (%o)", async (binding) => {
    await boot(undefined, true, { ...legacy, ...binding });
    const before = localStorage.getItem("expenses_users");
    await signIn();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    locked();
  });

  it.each([["password"], ["password", "totp"], ["otp"], ["email/signup"]])(
    "restores a verified existing session (%s)",
    async (...methods) => {
      const cloud = fakeCloud();
      cloud.restore(methods);
      await boot(cloud);
      opened();
      expect(cloud.client.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(cloud.client.auth.getUser).toHaveBeenCalledWith(token(serverUser, methods));
    },
  );

  it("does not restore a recovery-only session as a financial account", async () => {
    const cloud = fakeCloud();
    cloud.restore(["recovery"]);
    await boot(cloud);
    locked();
    expect(value("google-status").textContent).toContain("Conectează-te din nou");
  });

  it("respects explicit logout even with a saved SDK session", async () => {
    const cloud = fakeCloud();
    cloud.restore();
    await boot(cloud, true, null);
    expect(cloud.client.auth.getSession).not.toHaveBeenCalled();
    locked();
  });

  it("locks on server sign-out or a refresh with a different authentication method", async () => {
    const cloud = await boot();
    await signIn();
    cloud.refresh(["anonymous"]);
    locked();
    expect(value("google-status").textContent).toContain("verificată din nou");
    await signIn();
    cloud.signOut();
    locked();
    expect(win["HopperApp"].currentUser()).toBeNull();
  });

  it("keeps access locked until native persistence finishes", async () => {
    await boot();
    let finish!: () => void;
    win["HopperPersistence"] = {
      schedule: vi.fn(),
      flush: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const pending = signIn();
    await vi.waitFor(() => expect(win["HopperPersistence"].flush).toHaveBeenCalled());
    locked();
    expect(win["HopperApp"].currentUser()).toBeNull();
    finish();
    await pending;
    opened();
  });

  it("rolls back local records if native persistence fails", async () => {
    await boot();
    const before = localStorage.getItem("expenses_users");
    win["HopperPersistence"] = {
      schedule: vi.fn(),
      flush: vi.fn(async () => {
        throw Error("disk");
      }),
    };
    await signIn();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(auth().canOpen(legacy)).toBe(false);
    locked();
  });

  it("packages auth before financial code and prepares owner-restricted password access", () => {
    const core = appScripts.filter((entry) => entry.required).map((entry) => entry.src);
    expect(core.indexOf("auth.js")).toBeLessThan(core.indexOf("script.js"));
    expect(source).not.toContain(".mfa.");
    const sql = readFileSync("supabase/migrations/202610080003_hopper_password_auth.sql", "utf8");
    expect(sql).toContain("drop policy if exists hopper_require_mfa");
    expect(sql).toContain("drop policy if exists hopper_require_email_code");
    expect(sql).toContain("as restrictive");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain('"method":"password"');
    expect(sql).not.toContain("'aal2'");
  });
});

describe("Google native PKCE authentication", () => {
  const googleUser = {
    ...serverUser,
    app_metadata: { providers: ["google"] },
    identities: [{ provider: "google" }],
  };
  const pendingKey = "hopper_google_attempt:https://project.supabase.co";
  async function googleBoot(existing: any = legacy) {
    const cloud = fakeCloud();
    cloud.changeUser(structuredClone(googleUser));
    win["HopperOAuth"] = { open: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    await boot(cloud, true, existing);
    auth().chooseMethod("google");
    return cloud;
  }
  const callback = (cloud: ReturnType<typeof fakeCloud>, suffix = "&code=google-test-code") =>
    cloud.client.auth.signInWithOAuth.mock.lastCall![0].options.redirectTo + suffix;
  it("shows Google without visible password or recovery forms", async () => {
    await googleBoot();
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-auth-method]")].map(
        (el) => el.dataset["authMethod"],
      ),
    ).toEqual([]);
    expect(value("google-form")).toHaveClass("active");
    for (const id of ["login-form", "register-form", "recovery-form", "reset-password-form"])
      expect(value(id).closest("[hidden]")).not.toBeNull();
    expect(value("google-sign-in").textContent).toContain("Continuă cu Google");
  });
  it("opens only the configured Supabase PKCE URL without exposing the budget", async () => {
    const cloud = await googleBoot();
    const before = localStorage.getItem("expenses_users");
    value("google-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(win["HopperOAuth"].open).toHaveBeenCalledOnce());
    const input = cloud.client.auth.signInWithOAuth.mock.lastCall![0];
    expect(input.provider).toBe("google");
    expect(input.options.skipBrowserRedirect).toBe(true);
    expect(input.options.queryParams.prompt).toBe("select_account");
    expect(new URL(input.options.redirectTo).pathname).toBe("/google");
    expect(value("google-cancel").hidden).toBe(false);
    expect(cloud.sdk.createClient.mock.lastCall![2].auth.flowType).toBe("pkce");
    expect(cloud.sdk.createClient.mock.lastCall![2].auth.detectSessionInUrl).toBe(false);
    expect(localStorage.getItem("expenses_users")).toBe(before);
    locked();
  });
  it("validates the server identity after code exchange and preserves the existing budget and photo", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    await auth().completeGoogle(callback(cloud));
    opened();
    expect(cloud.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("google-test-code");
    expect(cloud.client.auth.getUser).toHaveBeenCalledWith(token(googleUser, ["oauth"]));
    expect(JSON.parse(localStorage.getItem("expenses_current_user")!)).toMatchObject({
      ...legacy,
      authMethod: "google",
      authAccountId: serverUser.id,
    });
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(cloud.client.rpc).not.toHaveBeenCalled();
  });
  it("creates new Google accounts only after server verification", async () => {
    const cloud = await googleBoot(null);
    await auth().signInGoogle();
    expect(localStorage.getItem("expenses_users")).toBeNull();
    await auth().completeGoogle(callback(cloud));
    opened();
    const account = JSON.parse(localStorage.getItem("expenses_current_user")!);
    expect(account.expenses).toEqual([]);
    expect(account.incomes).toEqual([]);
    expect(account).not.toHaveProperty("password");
    expect(account).not.toHaveProperty("profilePhoto");
  });
  it.each([
    "https://example.test/auth?attempt=wrong&code=test",
    "ro.hopper.budget://other/google?attempt=wrong&code=test",
    "ro.hopper.budget://auth/other?attempt=wrong&code=test",
    "ro.hopper.budget://auth/google?attempt=wrong&code=test",
    "ro.hopper.budget://auth/google?attempt=wrong&code=test#access_token=untrusted",
  ])("ignores unrelated callbacks %s", async (url) => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    await auth().completeGoogle(url);
    expect(cloud.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    locked();
  });
  it.each([
    "&error=access_denied",
    "",
    "&code=first&code=second",
    "&code=test&access_token=untrusted",
  ])("rejects invalid matching returns and allows a fresh attempt (%s)", async (suffix) => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    await auth().completeGoogle(callback(cloud, suffix));
    expect(cloud.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(value("google-cancel").hidden).toBe(true);
    expect(value("google-status").hidden).toBe(false);
    locked();
  });
  it("does not replay a completed callback", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    const url = callback(cloud);
    await auth().completeGoogle(url);
    await auth().completeGoogle(url);
    opened();
    expect(cloud.client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  it("does not launch two overlapping Google attempts", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    await auth().signInGoogle();
    expect(cloud.client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(win["HopperOAuth"].open).toHaveBeenCalledTimes(1);
  });
  it("ignores callback proof after the user cancels the attempt", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    const url = callback(cloud);
    auth().chooseMethod("google");
    await auth().completeGoogle(url);
    expect(cloud.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(value("google-form")).toHaveClass("active");
    locked();
  });
  it("cancels delayed session exchange without changing saved budgets", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    const before = localStorage.getItem("expenses_users");
    let done!: (value: any) => void;
    const actual = cloud.client.auth.exchangeCodeForSession.getMockImplementation()!;
    cloud.client.auth.exchangeCodeForSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const pending = auth().completeGoogle(callback(cloud));
    await auth().cancel();
    done(await actual());
    await pending;
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    locked();
  });
  it("can cancel an expired pending attempt", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    const pending = JSON.parse(localStorage.getItem(pendingKey)!);
    localStorage.setItem(
      pendingKey,
      JSON.stringify({ ...pending, createdAt: Date.now() - 11 * 60000 }),
    );
    await auth().cancelGoogle();
    expect(value("google-cancel").hidden).toBe(true);
    expect(value("google-sign-in")).not.toBeDisabled();
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });
  it("queues a valid callback received while the native browser is still opening", async () => {
    const cloud = await googleBoot();
    let openedBrowser!: () => void;
    win["HopperOAuth"].open.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          openedBrowser = resolve;
        }),
    );
    const launch = auth().signInGoogle();
    await vi.waitFor(() => expect(win["HopperOAuth"].open).toHaveBeenCalledOnce());
    await auth().completeGoogle(callback(cloud));
    expect(cloud.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    openedBrowser();
    await launch;
    await vi.waitFor(opened);
    expect(cloud.client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  it("resumes a pending attempt after reopening the native app without accepting an unrelated session", async () => {
    const cloud = fakeCloud();
    cloud.changeUser(googleUser);
    win["HopperOAuth"] = { open: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const attempt = { nonce: "0123456789abcdef0123456789abcdef", createdAt: Date.now() };
    await boot(cloud, true, legacy, attempt);
    expect(value("google-cancel").hidden).toBe(false);
    expect(cloud.client.auth.getUser).not.toHaveBeenCalled();
    locked();
    await auth().completeGoogle(
      "ro.hopper.budget://auth/google?attempt=" + attempt.nonce + "&code=cold-test-code",
    );
    opened();
    expect(cloud.client.auth.exchangeCodeForSession).toHaveBeenCalledOnce();
  });
  it.each([
    {
      ...googleUser,
      app_metadata: { providers: ["github"] },
      identities: [{ provider: "github" }],
    },
    { ...googleUser, email_confirmed_at: undefined },
    { ...googleUser, identities: [] },
    { ...googleUser, is_anonymous: true },
  ])("rejects unverified or non-Google server identities", async (user) => {
    const cloud = await googleBoot();
    cloud.changeUser(user);
    await auth().signInGoogle();
    await auth().completeGoogle(callback(cloud));
    locked();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacy]);
  });
  it("rejects the session if its token claims a different email", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    cloud.client.auth.getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: token({ ...googleUser, email: "other@example.test" }, ["oauth"]) },
      },
      error: null,
    });
    await auth().completeGoogle(callback(cloud));
    locked();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacy]);
  });
  it("keeps unsupported browser launches locked with actionable feedback", async () => {
    const cloud = await googleBoot();
    delete win["HopperOAuth"];
    await auth().signInGoogle();
    locked();
    expect(value("google-status").textContent).toContain("aplicația actualizată");
    expect(cloud.client.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it("rejects a provider URL from a different origin", async () => {
    const cloud = await googleBoot();
    cloud.client.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: "https://example.test/auth" },
      error: null,
    });
    await auth().signInGoogle();
    locked();
    expect(win["HopperOAuth"].open).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });
  it("rejects plaintext PKCE challenge generation", async () => {
    const cloud = await googleBoot();
    const actual = cloud.client.auth.signInWithOAuth.getMockImplementation()!;
    cloud.client.auth.signInWithOAuth.mockImplementationOnce(async (input) => {
      const result = await actual(input);
      const url = new URL(result.data.url);
      url.searchParams.set("code_challenge_method", "plain");
      return { data: { url: url.href }, error: null };
    });
    await auth().signInGoogle();
    locked();
    expect(win["HopperOAuth"].open).not.toHaveBeenCalled();
  });
  it("shows an actionable error when the native provider check reports Google disabled", async () => {
    const cloud = await googleBoot();
    win["HopperOAuth"].open.mockRejectedValueOnce(Error("google-provider-disabled"));
    await auth().signInGoogle();
    locked();
    expect(value("google-status").textContent).toContain("nu este disponibilă");
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacy]);
  });
  it("does not treat an automatic browser close during code exchange as user cancellation", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    let done!: (value: any) => void;
    const actual = cloud.client.auth.exchangeCodeForSession.getMockImplementation()!;
    cloud.client.auth.exchangeCodeForSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const pending = auth().completeGoogle(callback(cloud));
    await auth().cancelGoogle(true);
    done(await actual());
    await pending;
    opened();
  });
  it("shows provider failures without a partial local account", async () => {
    const cloud = await googleBoot();
    cloud.client.auth.signInWithOAuth.mockResolvedValueOnce({
      data: {},
      error: { code: "provider_disabled" },
    });
    await auth().signInGoogle();
    locked();
    expect(value("google-status").textContent).toContain("nu este disponibilă");
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });
  it("rolls back when the native account mirror fails", async () => {
    const cloud = await googleBoot();
    await auth().signInGoogle();
    const before = localStorage.getItem("expenses_users");
    win["HopperPersistence"] = {
      schedule: vi.fn(),
      flush: vi.fn(async () => {
        throw Error("disk");
      }),
    };
    await auth().completeGoogle(callback(cloud));
    locked();
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });
  it("revalidates existing Google sessions without another browser launch", async () => {
    const cloud = fakeCloud();
    cloud.changeUser(googleUser);
    cloud.restore(["oauth"]);
    await boot(cloud, true, {
      ...legacy,
      authAccountId: serverUser.id,
      authProject: "https://project.supabase.co",
      authMethod: "google",
    });
    opened();
    expect(cloud.client.auth.signInWithOAuth).not.toHaveBeenCalled();
    cloud.refresh(["password"]);
    locked();
  });
});
