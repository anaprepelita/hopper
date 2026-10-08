/* eslint-disable @typescript-eslint/no-explicit-any -- Mock the untyped standalone Supabase bridge. */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appScripts } from "../mobile/resources.mjs";

const html = readFileSync("mobile/app/index.html", "utf8");
const source = readFileSync("mobile/app/auth.js", "utf8");
const financial = readFileSync("mobile/app/script.js", "utf8");
const win = window as unknown as Record<string, any>;
const email = "student@example.test";
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
  user_metadata: { name: "Ana" },
};
const value = (id: string) => document.getElementById(id) as HTMLInputElement;
const auth = () => win["HopperAuth"];
const locked = () => expect(document.getElementById("app-screen")).toHaveClass("hidden");

function fakeCloud() {
  let session: any = null,
    level = "aal1";
  let factors: any[] = [];
  const listeners: Array<(event: string, session: any) => void> = [];
  const notify = (event: string) => listeners.forEach((callback) => callback(event, session));
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: any) => void) => {
        listeners.push(callback);
      }),
      stopAutoRefresh: vi.fn(),
      getSession: vi.fn(async (): Promise<any> => ({ data: { session }, error: null })),
      getUser: vi.fn(async (): Promise<any> => ({ data: { user: serverUser }, error: null })),
      signInWithPassword: vi.fn(async (): Promise<any> => {
        session = { user: serverUser };
        notify("SIGNED_IN");
        return { data: { session, user: serverUser }, error: null };
      }),
      signUp: vi.fn(async (): Promise<any> => ({
        data: { session: null, user: serverUser },
        error: null,
      })),
      verifyOtp: vi.fn(async (): Promise<any> => {
        session = { user: serverUser };
        return { data: { session }, error: null };
      }),
      resend: vi.fn(async (): Promise<any> => ({ data: {}, error: null })),
      signOut: vi.fn(async () => {
        session = null;
        notify("SIGNED_OUT");
        return { error: null };
      }),
      mfa: {
        listFactors: vi.fn(async (): Promise<any> => ({
          data: { totp: factors.filter((factor) => factor.status === "verified"), all: factors },
          error: null,
        })),
        getAuthenticatorAssuranceLevel: vi.fn(async (): Promise<any> => ({
          data: { currentLevel: level, nextLevel: "aal2" },
          error: null,
        })),
        enroll: vi.fn(async (): Promise<any> => {
          factors.push({
            id: "factor-a",
            factor_type: "totp",
            status: "unverified",
            friendly_name: "Hopper",
          });
          return {
            data: {
              id: "factor-a",
              totp: {
                qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
                secret: "TESTSETUPKEY",
              },
            },
            error: null,
          };
        }),
        challengeAndVerify: vi.fn(async (): Promise<any> => {
          level = "aal2";
          factors = [
            { id: "factor-a", factor_type: "totp", status: "verified", friendly_name: "Hopper" },
          ];
          return { data: {}, error: null };
        }),
        unenroll: vi.fn(async ({ factorId }: { factorId: string }) => {
          factors = factors.filter((factor) => factor.id !== factorId);
          return { error: null };
        }),
      },
    },
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return {
    client,
    sdk: { createClient: vi.fn(() => client) },
    verified(aal = "aal1") {
      factors = [{ id: "factor-a", factor_type: "totp", status: "verified" }];
      level = aal;
    },
    restore() {
      session = { user: serverUser };
    },
    signOut: () => {
      session = null;
      notify("SIGNED_OUT");
    },
    refresh(aal: string) {
      session = {
        user: serverUser,
        access_token: "header." + btoa(JSON.stringify({ aal })) + ".signature",
      };
      notify("TOKEN_REFRESHED");
    },
  };
}
async function boot(cloud = fakeCloud(), configured = true, user: any = legacy) {
  localStorage.clear();
  if (user) {
    localStorage.setItem("expenses_users", JSON.stringify([user]));
    localStorage.setItem("expenses_current_user", JSON.stringify(user));
  }
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
async function signIn() {
  await auth().signIn({ email, password: "server-password" });
}
async function verify() {
  value("mfa-code").value = "123456";
  await auth().verify();
}

afterEach(() => {
  auth()?.dispose();
  win["HopperApp"]?.dispose();
  for (const key of [
    "HopperAuth",
    "HopperApp",
    "HopperCloudConfig",
    "HopperPersistence",
    "supabase",
  ])
    delete win[key];
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

describe("Mandatory authenticator MFA", () => {
  it("does not trust a stored local user when the backend is unconfigured", async () => {
    const cloud = await boot(undefined, false);
    locked();
    expect(document.getElementById("login-status")?.textContent).toContain("nu este disponibilă");
    expect(cloud.sdk.createClient).not.toHaveBeenCalled();
    const before = localStorage.getItem("expenses_users");
    value("income-amount").value = "50";
    document
      .getElementById("income-form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(auth().canOpen(legacy)).toBe(false);
  });

  it("cannot open the dashboard without the authentication controller", () => {
    localStorage.setItem("expenses_users", JSON.stringify([legacy]));
    localStorage.setItem("expenses_current_user", JSON.stringify(legacy));
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
      dialog.close = vi.fn();
    });
    new Function(financial)();
    expect(win["HopperApp"].currentUser()).toBeNull();
    expect(win["HopperApp"].openUser(legacy)).toBe(false);
    locked();
  });

  it("enrolls new factors but keeps data unchanged until the first code is verified", async () => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    await signIn();
    locked();
    expect(cloud.client.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Hopper",
      issuer: "Hopper",
    });
    expect(document.getElementById("mfa-form")).toHaveClass("active");
    expect(value("mfa-secret").value).toBe("TESTSETUPKEY");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect([...Object.values(localStorage)].join()).not.toContain("TESTSETUPKEY");
    await verify();
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
    const stored = JSON.parse(localStorage.getItem("expenses_users")!)[0];
    expect(stored).toEqual({
      ...legacy,
      authAccountId: "account-a",
      authProject: "https://project.supabase.co",
    });
    expect(stored.cloudAccountId).toBeUndefined();
    expect(cloud.client.rpc).not.toHaveBeenCalled();
    expect(value("mfa-secret").value).toBe("");
    expect(document.getElementById("mfa-qr")).not.toHaveAttribute("src");
    expect(auth().canOpen(stored)).toBe(true);
  });

  it("asks existing TOTP users for a code without enrolling another factor", async () => {
    const cloud = fakeCloud();
    cloud.verified();
    await boot(cloud);
    await signIn();
    locked();
    expect(document.getElementById("mfa-setup")).toHaveAttribute("hidden");
    expect(cloud.client.auth.mfa.enroll).not.toHaveBeenCalled();
    await verify();
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
  });

  it.each(["", "123", "abcdef", "1234567"])(
    "rejects a malformed code without sending it (%s)",
    async (code) => {
      const cloud = await boot();
      await signIn();
      value("mfa-code").value = code;
      await auth().verify();
      locked();
      expect(cloud.client.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
      expect(value("mfa-code")).toHaveAttribute("aria-invalid", "true");
      expect(document.getElementById("mfa-status")?.textContent).toContain("6 cifre");
    },
  );

  it("keeps a failed code on the MFA screen and allows a fresh code", async () => {
    const cloud = await boot();
    await signIn();
    cloud.client.auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: { code: "mfa_verification_failed" },
    });
    await verify();
    locked();
    expect(document.getElementById("mfa-status")?.textContent).toContain("incorect sau a expirat");
    expect(document.getElementById("mfa-form")).toHaveClass("active");
    await verify();
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
  });

  it("revalidates restored sessions with the server instead of trusting local AAL claims", async () => {
    const cloud = fakeCloud();
    cloud.restore();
    cloud.verified("aal2");
    cloud.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });
    const original = JSON.stringify([legacy]);
    await boot(cloud);
    locked();
    expect(cloud.client.auth.getUser).toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe(original);
  });

  it("restores a valid AAL2 session while preserving the existing account", async () => {
    const cloud = fakeCloud();
    cloud.restore();
    cloud.verified("aal2");
    await boot(cloud);
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
    expect(cloud.client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)[0].expenses).toEqual(
      legacy.expenses,
    );
  });

  it("does not resume a server session after explicit local logout", async () => {
    const cloud = fakeCloud();
    cloud.restore();
    cloud.verified("aal2");
    await boot(cloud, true, null);
    locked();
    expect(cloud.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("requires setup even for an AAL2 session with no verified TOTP factor", async () => {
    const cloud = fakeCloud();
    cloud.verified("aal2");
    cloud.client.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [], all: [] },
      error: null,
    });
    await boot(cloud);
    await signIn();
    locked();
    expect(cloud.client.auth.mfa.enroll).toHaveBeenCalled();
  });

  it("cannot bypass MFA with a successful challenge that leaves the session at AAL1", async () => {
    const cloud = fakeCloud();
    cloud.verified();
    await boot(cloud);
    await signIn();
    cloud.client.auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    await verify();
    locked();
    expect(auth().canOpen(legacy)).toBe(false);
  });

  it("ignores a verification response arriving after cancellation", async () => {
    const cloud = await boot();
    await signIn();
    let release!: (response: any) => void;
    cloud.client.auth.mfa.challengeAndVerify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    value("mfa-code").value = "123456";
    const pending = auth().verify();
    await auth().cancel();
    release({ data: {}, error: null });
    await pending;
    locked();
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacy]);
    expect(value("mfa-secret").value).toBe("");
    expect(cloud.client.auth.signOut).toHaveBeenCalled();
  });

  it("removes an unfinished enrollment on cancel without deleting an existing factor", async () => {
    const cloud = await boot();
    await signIn();
    await auth().cancel();
    expect(cloud.client.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-a" });
    cloud.client.auth.mfa.unenroll.mockClear();
    cloud.verified();
    await signIn();
    await auth().cancel();
    expect(cloud.client.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("keeps accounts intact on invalid credentials and on offline errors", async () => {
    const cloud = await boot();
    const before = localStorage.getItem("expenses_users");
    cloud.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { code: "invalid_credentials" },
    });
    await signIn();
    expect(document.getElementById("login-status")?.textContent).toContain("Emailul sau parola");
    cloud.client.auth.signInWithPassword.mockRejectedValueOnce(new Error("network"));
    await signIn();
    locked();
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it("requires email confirmation before enrolling or saving a new account", async () => {
    const cloud = await boot(undefined, true, null);
    await auth().register({ name: "Ana", email, password: "private-password" });
    locked();
    expect(document.getElementById("mfa-status")?.textContent).toContain(
      "confirmare primit pe email",
    );
    expect(document.getElementById("mfa-status")).toHaveAttribute("data-kind", "success");
    expect(localStorage.getItem("expenses_users")).toBeNull();
    expect(cloud.client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(cloud.client.auth.signUp).toHaveBeenCalledWith({
      email,
      password: "private-password",
      options: { data: { name: "Ana" } },
    });
  });

  it("verifies the signup email inside the app, then still requires TOTP", async () => {
    const cloud = await boot(undefined, true, null);
    await auth().register({ name: "Ana", email, password: "private-password" });
    await verify();
    expect(cloud.client.auth.verifyOtp).toHaveBeenCalledWith({
      email,
      token: "123456",
      type: "email",
    });
    expect(cloud.client.auth.mfa.enroll).toHaveBeenCalled();
    expect(document.getElementById("mfa-setup")).not.toHaveAttribute("hidden");
    locked();
    expect(localStorage.getItem("expenses_users")).toBeNull();
    await verify();
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
  });

  it("can resend signup codes and rejects expired email codes without opening the account", async () => {
    const cloud = await boot(undefined, true, null);
    await auth().register({ name: "Ana", email, password: "private-password" });
    await auth().resend();
    expect(cloud.client.auth.resend).toHaveBeenCalledWith({ type: "signup", email });
    cloud.client.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: "otp_expired" } });
    await verify();
    locked();
    expect(document.getElementById("mfa-status")?.textContent).toContain("Codul de email");
    expect(document.getElementById("mfa-resend")).not.toHaveAttribute("hidden");
  });

  it("ignores email verification that completes after cancellation", async () => {
    const cloud = await boot(undefined, true, null);
    await auth().register({ name: "Ana", email, password: "private-password" });
    let release!: (response: any) => void;
    cloud.client.auth.verifyOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    value("mfa-code").value = "123456";
    const pending = auth().verify();
    await auth().cancel();
    release({ data: { session: { user: serverUser } }, error: null });
    await pending;
    locked();
    expect(cloud.client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBeNull();
  });

  it("stores no password for new accounts after confirmed registration and MFA", async () => {
    const cloud = await boot(undefined, true, null);
    cloud.client.auth.signUp.mockResolvedValue({
      data: { session: { user: serverUser } },
      error: null,
    });
    await auth().register({ name: "Ana", email, password: "private-password" });
    locked();
    await verify();
    const stored = JSON.parse(localStorage.getItem("expenses_users")!)[0];
    expect(stored.password).toBeUndefined();
    expect(stored.email).toBe(email);
    expect(stored.authAccountId).toBe("account-a");
  });

  it("rejects an account bound to a different Supabase identity", async () => {
    const cloud = fakeCloud();
    cloud.verified();
    await boot(cloud, true, {
      ...legacy,
      authAccountId: "other-id",
      authProject: "https://project.supabase.co",
    });
    const before = localStorage.getItem("expenses_users");
    await signIn();
    await verify();
    locked();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.getElementById("mfa-status")?.textContent).toContain("nu corespunde");
  });

  it("does not authorize another identity if it changes during the challenge", async () => {
    const cloud = await boot();
    await signIn();
    cloud.client.auth.getUser.mockResolvedValue({
      data: { user: { ...serverUser, id: "other-id" } },
      error: null,
    });
    await verify();
    locked();
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacy]);
  });

  it("locks the dashboard when the server signs the account out", async () => {
    const cloud = await boot();
    await signIn();
    await verify();
    cloud.signOut();
    locked();
    expect(auth().canOpen(JSON.parse(localStorage.getItem("expenses_current_user")!))).toBe(false);
  });

  it("keeps financial actions locked while the authenticated native copy is still pending", async () => {
    await boot();
    await signIn();
    let release!: () => void;
    win["HopperPersistence"] = {
      schedule: vi.fn(),
      flush: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const pending = verify();
    await vi.waitFor(() => expect(win["HopperPersistence"].flush).toHaveBeenCalled());
    const before = localStorage.getItem("expenses_users");
    expect(win["HopperApp"].currentUser()).toBeNull();
    value("income-amount").value = "50";
    document
      .getElementById("income-form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    expect(localStorage.getItem("expenses_users")).toBe(before);
    locked();
    release();
    await pending;
    expect(document.getElementById("app-screen")).not.toHaveClass("hidden");
  });

  it("locks a verified account if the refreshed session loses its second-factor assurance", async () => {
    const cloud = await boot();
    await signIn();
    await verify();
    cloud.refresh("aal1");
    locked();
    expect(document.getElementById("login-status")?.textContent).toContain("verificată din nou");
    expect(win["HopperApp"].currentUser()).toBeNull();
  });

  it("never opens an account when persistence fails after MFA", async () => {
    const cloud = await boot();
    await signIn();
    const before = localStorage.getItem("expenses_users");
    win["HopperPersistence"] = {
      schedule: vi.fn(),
      flush: vi.fn(async () => {
        throw new Error("disk");
      }),
    };
    await verify();
    locked();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(auth().canOpen(legacy)).toBe(false);
  });

  it("packages auth as a required dependency before financial startup and requires AAL2 in SQL", () => {
    const core = appScripts.filter((entry) => entry.required).map((entry) => entry.src);
    expect(core.indexOf("auth.js")).toBeLessThan(core.indexOf("script.js"));
    expect(core).toContain("vendor/supabase.js");
    const sql = readFileSync("supabase/migrations/202610080001_hopper_mfa.sql", "utf8");
    expect(sql).toContain("as restrictive");
    expect(sql).toContain("for all");
    expect(sql.match(/'aal2'/g)).toHaveLength(2);
  });
});
