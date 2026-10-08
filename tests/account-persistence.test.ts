import { installAuthenticatedSession } from "./helpers/authenticated-app";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_BACKUP_KEY,
  createAccountPersistence,
  HopperStorageError,
} from "../mobile/persistence";
import { bootNativeInterface } from "../mobile/bootstrap";
import { readFileSync } from "node:fs";
const U = "expenses_users",
  C = "expenses_current_user";
const ana = {
  email: "ana@example.test",
  password: "test-only",
  expenses: [{ amount: 12, custom: true }],
  profilePhoto: "data:image/jpeg;base64,TEST",
  customMetadata: { retained: true },
};
function store(initial: string | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => ({ value })),
    set: vi.fn(async (options: { key: string; value: string }) => {
      value = options.value;
    }),
    value: () => value,
  };
}
const snapshot = (users: unknown[], current: unknown = null) =>
  JSON.stringify({
    version: 1,
    users: JSON.stringify(users),
    current: current === null ? null : JSON.stringify(current),
  });
beforeEach(() => {
  localStorage.clear();
  delete window.HopperPersistence;
});
afterEach(() => {
  delete window.HopperPersistence;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Native account persistence", () => {
  it("migrates existing records and photographs without changing their raw JSON", async () => {
    const users = JSON.stringify([ana], null, 2),
      current = JSON.stringify(ana, null, 1);
    localStorage.setItem(U, users);
    localStorage.setItem(C, current);
    const native = store();
    await createAccountPersistence(native);
    expect(JSON.parse(native.value()!)).toEqual({ version: 1, users, current });
    expect(localStorage.getItem(U)).toBe(users);
    expect(localStorage.getItem(C)).toBe(current);
    expect(native.set.mock.calls[0]![0].key).toBe(ACCOUNT_BACKUP_KEY);
  });
  it("restores a lost WebView account list and session before showing any form", async () => {
    const native = store(snapshot([ana], ana));
    document.body.innerHTML = new DOMParser().parseFromString(
      readFileSync("mobile/app/index.html", "utf8"),
      "text/html",
    ).body.innerHTML;
    const load = vi.fn(async () => {
      expect(JSON.parse(localStorage.getItem(U)!)).toEqual([ana]);
      expect(JSON.parse(localStorage.getItem(C)!)).toEqual(ana);
    });
    expect(
      await bootNativeInterface(true, load, async () => {
        await createAccountPersistence(native);
      }),
    ).toBe(true);
    expect(load).toHaveBeenCalled();
  });
  it("keeps newer local edits rather than replacing them with an old backup", async () => {
    const changed = { ...ana, incomes: [{ amount: 999, currency: "EUR" }] };
    localStorage.setItem(U, JSON.stringify([changed]));
    localStorage.setItem(C, JSON.stringify(changed));
    const native = store(snapshot([ana], ana));
    await createAccountPersistence(native);
    expect(JSON.parse(JSON.parse(native.value()!).users)).toEqual([changed]);
  });
  it("recovers a missing account list from the current session and keeps other accounts", async () => {
    const other = { email: "other@example.test", custom: 9 };
    const changed = { ...ana, custom: "newer" };
    localStorage.setItem(C, JSON.stringify(changed));
    await createAccountPersistence(store(snapshot([ana, other], ana)));
    expect(JSON.parse(localStorage.getItem(U)!)).toEqual([changed, other]);
    expect(JSON.parse(localStorage.getItem(C)!)).toEqual(changed);
  });
  it("recovers an orphan session even without a previous native mirror", async () => {
    localStorage.setItem(C, JSON.stringify(ana));
    await createAccountPersistence(store());
    expect(JSON.parse(localStorage.getItem(U)!)).toEqual([ana]);
  });
  it("does not resurrect a logged-out session when only its local key is absent", async () => {
    localStorage.setItem(U, JSON.stringify([ana]));
    const native = store(snapshot([ana], ana));
    await createAccountPersistence(native);
    expect(localStorage.getItem(C)).toBeNull();
    expect(JSON.parse(native.value()!).current).toBeNull();
  });
  it("persists explicit logout and restores accounts without logging in after WebView loss", async () => {
    localStorage.setItem(U, JSON.stringify([ana]));
    localStorage.setItem(C, JSON.stringify(ana));
    const native = store();
    const persistence = await createAccountPersistence(native);
    localStorage.removeItem(C);
    persistence.schedule();
    await persistence.flush();
    localStorage.clear();
    await createAccountPersistence(native);
    expect(JSON.parse(localStorage.getItem(U)!)).toEqual([ana]);
    expect(localStorage.getItem(C)).toBeNull();
  });
  it("coalesces both account writes and serializes rapid updates", async () => {
    const native = store();
    const persistence = await createAccountPersistence(native);
    localStorage.setItem(U, JSON.stringify([ana]));
    persistence.schedule();
    localStorage.setItem(C, JSON.stringify(ana));
    persistence.schedule();
    await persistence.flush();
    expect(native.set).toHaveBeenCalledTimes(2);
    expect(JSON.parse(native.value()!).current).toBe(JSON.stringify(ana));
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const original = native.set.getMockImplementation()!;
    native.set.mockImplementationOnce(async (options) => {
      await new Promise<void>((resolve) => {
        release = resolve;
        started();
      });
      await original(options);
    });
    localStorage.setItem(U, JSON.stringify([{ ...ana, custom: 1 }]));
    const first = persistence.flush();
    await entered;
    localStorage.setItem(U, JSON.stringify([{ ...ana, custom: 2 }]));
    const second = persistence.flush();
    release();
    await Promise.all([first, second]);
    expect(JSON.parse(JSON.parse(native.value()!).users)[0].custom).toBe(2);
  });
  it("retains both copies on write failure and retries the failed snapshot", async () => {
    localStorage.setItem(U, JSON.stringify([ana]));
    const native = store(),
      warning = vi.fn();
    const persistence = await createAccountPersistence(native, localStorage, warning);
    const previous = native.value();
    const changed = JSON.stringify([{ ...ana, custom: "pending" }]);
    localStorage.setItem(U, changed);
    native.set.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(persistence.flush()).rejects.toThrow();
    expect(native.value()).toBe(previous);
    expect(localStorage.getItem(U)).toBe(changed);
    expect(warning).toHaveBeenLastCalledWith(true);
    await persistence.flush();
    expect(JSON.parse(native.value()!).users).toBe(changed);
    expect(warning).toHaveBeenLastCalledWith(false);
  });
  it.each(["read failure", "malformed backup", "malformed local"])(
    "blocks startup rather than displaying an empty account on %s",
    async (reason) => {
      const native = store(reason === "malformed backup" ? "{broken" : snapshot([ana], ana));
      if (reason === "read failure") native.get.mockRejectedValueOnce(new Error("Unavailable"));
      if (reason === "malformed local") localStorage.setItem(U, "{broken");
      document.body.innerHTML = new DOMParser().parseFromString(
        readFileSync("mobile/app/index.html", "utf8"),
        "text/html",
      ).body.innerHTML;
      const load = vi.fn(async () => {});
      expect(
        await bootNativeInterface(true, load, async () => {
          await createAccountPersistence(native);
        }),
      ).toBe(false);
      expect(load).not.toHaveBeenCalled();
      expect(native.set).not.toHaveBeenCalled();
      expect(document.getElementById("native-interface")!.hidden).toBe(true);
      expect(document.getElementById("native-launch-message")!.textContent).toContain(
        "nu este nevoie să creezi alt cont",
      );
      expect(document.getElementById("native-launch-retry")!.hidden).toBe(false);
    },
  );
  it("never writes malformed local changes over the last valid mirror", async () => {
    const native = store(snapshot([ana], ana));
    const persistence = await createAccountPersistence(native);
    const previous = native.value();
    localStorage.setItem(U, "null");
    await expect(persistence.flush()).rejects.toBeInstanceOf(HopperStorageError);
    expect(native.value()).toBe(previous);
  });
  it("does not access native storage outside the native launch gate", async () => {
    document.body.innerHTML = new DOMParser().parseFromString(
      readFileSync("mobile/app/index.html", "utf8"),
      "text/html",
    ).body.innerHTML;
    const prepare = vi.fn(async () => {});
    expect(await bootNativeInterface(false, vi.fn(), prepare)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("Financial interface persistence hooks", () => {
  afterEach(() => {
    (window as Window & { HopperApp?: { dispose: () => void } }).HopperApp?.dispose();
    delete (window as Window & { HopperApp?: unknown }).HopperApp;
  });
  async function open() {
    const user = { ...ana, name: "Ana", expenses: [], incomes: [] };
    localStorage.setItem(U, JSON.stringify([user]));
    localStorage.setItem(C, JSON.stringify(user));
    const native = store();
    window.HopperPersistence = await createAccountPersistence(native);
    document.body.innerHTML = new DOMParser().parseFromString(
      readFileSync("mobile/app/index.html", "utf8"),
      "text/html",
    ).body.innerHTML;
    installAuthenticatedSession();
    new Function("document", "localStorage", "alert", readFileSync("mobile/app/script.js", "utf8"))(
      document,
      localStorage,
      vi.fn(),
    );
    return native;
  }
  it("mirrors a financial edit and logout through the existing interface", async () => {
    const native = await open();
    (document.getElementById("income-amount") as HTMLInputElement).value = "50";
    document
      .getElementById("income-form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await window.HopperPersistence!.flush();
    expect(JSON.parse(JSON.parse(native.value()!).users)[0].incomes).toHaveLength(1);
    document.getElementById("logout-button")!.click();
    await window.HopperPersistence!.flush();
    expect(JSON.parse(native.value()!).current).toBeNull();
    expect(JSON.parse(JSON.parse(native.value()!).users)[0].incomes).toHaveLength(1);
  });
  it("waits for the native copy before completing the authenticated account write", async () => {
    const native = await open();
    let release!: () => void;
    const original = window.HopperPersistence!.flush;
    window.HopperPersistence!.flush = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await original();
    });
    const bridge = (
      window as unknown as { HopperApp: { acceptAuthenticated: (user: object) => Promise<void> } }
    ).HopperApp;
    const current = JSON.parse(localStorage.getItem(C)!);
    let complete = false;
    const pending = bridge
      .acceptAuthenticated({ ...current, authAccountId: "verified" })
      .then(() => {
        complete = true;
      });
    expect(complete).toBe(false);
    release();
    await pending;
    expect(JSON.parse(JSON.parse(native.value()!).users)[0].authAccountId).toBe("verified");
  });

  it("rolls back both local account copies when the native write fails", async () => {
    await open();
    const beforeUsers = localStorage.getItem(U);
    const beforeCurrent = localStorage.getItem(C);
    window.HopperPersistence!.flush = vi.fn(async () => {
      throw new Error("Write failed");
    });
    const bridge = (
      window as unknown as { HopperApp: { acceptAuthenticated: (user: object) => Promise<void> } }
    ).HopperApp;
    const current = JSON.parse(beforeCurrent!);
    await expect(
      bridge.acceptAuthenticated({ ...current, authAccountId: "verified" }),
    ).rejects.toThrow();
    expect(localStorage.getItem(U)).toBe(beforeUsers);
    expect(localStorage.getItem(C)).toBe(beforeCurrent);
  });
});
