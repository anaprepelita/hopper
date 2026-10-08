import { installAuthenticatedSession } from "./helpers/authenticated-app";
/* eslint-disable @typescript-eslint/no-explicit-any -- Exercise untyped legacy JSON and the standalone JS bridge, including invalid payloads. */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("mobile/app/index.html", "utf8");
const sources = Object.fromEntries(
  ["translations", "i18n", "script", "sync"].map((name) => [
    name,
    readFileSync(`mobile/app/${name}.js`, "utf8"),
  ]),
);
const user = {
  name: "Ana",
  email: "ana@example.test",
  password: "local-only",
  profilePhoto: "data:image/jpeg;base64,eA==",
  customField: "keep",
  expenses: [
    { description: "Cantină", category: "Food", amount: 25, date: "2026-10-03", currency: "RON" },
  ],
  incomes: [],
  currency: "RON",
};
const cloudSession = {
  user: { id: "account-a", email: user.email, user_metadata: { name: "Ana" } },
};
type SyncAPI = {
  identifyRecords: (value: any, legacy?: boolean) => any;
  snapshot: (value: any) => any;
  mergeSnapshots: (
    base: any,
    local: any,
    remote: any,
    strategy?: string,
  ) => { data: any; conflicts: string[] };
  applySnapshot: (value: any, data: any) => any;
  validateSnapshot: (value: any) => any;
  connect: (register: boolean) => Promise<void>;
  synchronize: (strategy?: string) => Promise<void>;
  dispose: () => void;
};
const win = window as unknown as Record<string, any>;
const api = () => win["HopperSync"] as SyncAPI;
const stored = () => JSON.parse(localStorage.getItem("expenses_current_user")!);
function set(id: string, value: string) {
  (document.getElementById(id) as HTMLInputElement).value = value;
}
function boot(localUser: any = user, configured = false, sdk?: any) {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    dialog.showModal = vi.fn(() => {
      dialog.open = true;
    });
    dialog.close = vi.fn(() => {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    });
  });
  localStorage.setItem("expenses_users", JSON.stringify([localUser]));
  localStorage.setItem("expenses_current_user", JSON.stringify(localUser));
  installAuthenticatedSession(() => sdk?.createClient());
  for (const name of ["translations", "i18n", "script"])
    new Function("window", "document", "localStorage", "alert", sources[name]!)(
      window,
      document,
      localStorage,
      vi.fn(),
    );
  win["HopperCloudConfig"] = configured
    ? { url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }
    : {};
  win["supabase"] = sdk;
  new Function("window", "document", "localStorage", "crypto", sources["sync"]!)(
    window,
    document,
    localStorage,
    { randomUUID: () => `id-${Math.random()}` },
  );
}
function fakeCloud(initial: any = null) {
  let row = initial;
  let authChanged: (event: string, value: any) => void = () => {};
  const select = vi.fn(async () => ({ data: row, error: null }));
  const rpc = vi.fn(async (_name: string, args: any) => {
    if ((row?.revision || 0) !== args.expected_revision) return { data: [], error: null };
    row = { data: structuredClone(args.snapshot), revision: (row?.revision || 0) + 1 };
    return { data: [row], error: null };
  });
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback: typeof authChanged) => {
        authChanged = callback;
        return { data: {} };
      }),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithPassword: vi.fn(async () => {
        authChanged("SIGNED_IN", cloudSession);
        return { data: { session: cloudSession }, error: null };
      }),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => {
        authChanged("SIGNED_OUT", null);
        return { error: null };
      }),
      stopAutoRefresh: vi.fn(),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: select }) }) })),
    rpc,
  };
  return {
    sdk: { createClient: () => client },
    client,
    select,
    rpc,
    row: () => row,
    change: (value: any) => {
      row = value;
    },
  };
}
async function link() {
  const current = stored();
  current.cloudAccountId = cloudSession.user.id;
  current.cloudProject = "https://project.supabase.co";
  api().identifyRecords(current, true);
  win["HopperApp"].applyCloud(current);
  const auth = win["HopperAuth"].getClient().auth;
  await auth.signInWithPassword({ email: user.email, password: "test-only" });
  await api().synchronize();
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  api()?.dispose();
  win["HopperApp"]?.dispose();
  for (const key of [
    "HopperI18n",
    "HopperMessages",
    "HopperApp",
    "HopperCloudConfig",
    "HopperSync",
    "supabase",
  ])
    delete win[key];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("Language selection", () => {
  it("localizes category choices while preserving IDs, custom labels and saved records", () => {
    boot({ ...user, customCategories: [{ id: "custom-hobby", label: "Hobby personal" }] });
    const field = document.getElementById("category") as HTMLSelectElement;
    const before = localStorage.getItem("expenses_users");
    for (const language of ["ro", "en", "fr", "ru"]) {
      win["HopperI18n"].setLanguage(language);
      const expected = win["HopperI18n"].t("Detectează automat");
      expect(document.getElementById("expense-category-value")!.textContent).toBe(expected);
      document.getElementById("expense-category-button")!.click();
      expect(
        document.querySelector('#expense-category-options [data-value="auto"]')!.textContent,
      ).toBe(expected);
      expect(
        document.querySelector('#expense-category-options [data-value="custom-hobby"]')!
          .textContent,
      ).toBe("Hobby personal");
      document.getElementById("expense-category-close")!.click();
      expect(field.value).toBe("auto");
    }
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it("localizes the income picker while preserving source values and saved records", () => {
    boot();
    const source = document.getElementById("income-source") as HTMLSelectElement;
    source.value = "Sprijin de la familie";
    source.dispatchEvent(new Event("change", { bubbles: true }));
    const before = localStorage.getItem("expenses_users");
    for (const language of ["ro", "en", "fr", "ru"]) {
      win["HopperI18n"].setLanguage(language);
      const index = ["en", "fr", "ru"].indexOf(language);
      const label =
        index < 0 ? "Sprijin de la familie" : win["HopperMessages"]["Sprijin de la familie"][index];
      expect(document.getElementById("income-source-value")!.textContent).toBe(label);
      document.getElementById("income-source-button")!.click();
      const option = document.querySelector<HTMLButtonElement>(
        '#income-source-options [data-value="Sprijin de la familie"]',
      )!;
      expect(option.textContent).toBe(label);
      expect(option).toHaveAttribute("aria-pressed", "true");
      document.getElementById("income-source-close")!.click();
      expect(source.value).toBe("Sprijin de la familie");
    }
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it.each(["auth", "settings"])(
    "uses the retro picker from %s with keyboard selection and restored focus",
    (screen) => {
      boot();
      if (screen === "auth") document.getElementById("logout-button")!.click();
      else (document.querySelector('.view-tab[data-view="settings"]') as HTMLButtonElement).click();
      const before = localStorage.getItem("expenses_users");
      const trigger = document.getElementById(`${screen}-language-button`)!;
      const picker = document.getElementById("language-picker") as HTMLDialogElement;
      const field = document.getElementById(`${screen}-language`) as HTMLSelectElement;
      expect(field.hidden).toBe(true);
      expect(trigger.hidden).toBe(false);
      trigger.click();
      expect(picker.open).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      const choices = [...document.querySelectorAll<HTMLButtonElement>("#language-options button")];
      expect(choices.map((button) => button.textContent)).toEqual([
        "Română",
        "English",
        "Français",
        "Русский",
      ]);
      expect(document.activeElement).toBe(choices[0]);
      expect(choices[0]!.getAttribute("aria-pressed")).toBe("true");
      choices[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(choices[3]);
      choices[3]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(choices[2]);
      choices[2]!.click();
      expect(picker.open).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      expect(localStorage.getItem("hopper_language")).toBe("fr");
      expect(localStorage.getItem("expenses_users")).toBe(before);
      expect(document.getElementById("auth-language-value")!.textContent).toBe("Français");
      expect(document.getElementById("settings-language-value")!.textContent).toBe("Français");
      trigger.click();
      expect(
        document.querySelector<HTMLButtonElement>('#language-options [aria-pressed="true"]')
          ?.dataset["value"],
      ).toBe("fr");
      document.getElementById("language-close")!.click();
      expect(picker.open).toBe(false);
      expect(document.activeElement).toBe(trigger);
    },
  );
  it.each([
    ["en", "My budget", "October", "Your little achievements"],
    ["fr", "Mon budget", "octobre", "Tes petites réussites"],
    ["ru", "Мой бюджет", "октябрь", "Ваши маленькие достижения"],
  ])(
    "translates %s without changing records, currencies or typed input",
    (language, budget, month, heading) => {
      boot();
      set("description", "not yet saved");
      const before = localStorage.getItem("expenses_users");
      const control = document.getElementById("settings-language") as HTMLSelectElement;
      control.value = language!;
      control.dispatchEvent(new Event("change"));
      expect(document.documentElement.lang).toBe(language);
      expect(document.querySelector('.view-tab[data-view="home"]')?.textContent).toBe(budget);
      expect(document.getElementById("calendar-month-label")?.textContent).toContain(month);
      expect(document.getElementById("badges-title")?.textContent).toBe(heading);
      expect(document.getElementById("report-list")?.textContent).toContain("Cantină");
      expect((document.getElementById("description") as HTMLInputElement).value).toBe(
        "not yet saved",
      );
      expect(localStorage.getItem("expenses_users")).toBe(before);
      expect(localStorage.getItem("hopper_language")).toBe(language);
      expect((document.getElementById("auth-language") as HTMLSelectElement).value).toBe(language);
    },
  );
  it("restores the language, translates field warnings and keeps income option values canonical", () => {
    localStorage.setItem("hopper_language", "ru");
    boot();
    expect(document.getElementById("income-source")?.querySelector("option")?.value).toBe("Bursă");
    expect(document.getElementById("income-source")?.querySelector("option")?.textContent).toBe(
      "Стипендия",
    );
    document
      .getElementById("income-form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    expect(document.getElementById("income-amount-error")?.textContent).toBe("Введите сумму.");
    win["HopperI18n"].setLanguage("fr");
    expect(document.getElementById("income-amount-error")?.textContent).toBe("Indique le montant.");
    expect(document.getElementById("monthly-income")?.textContent).toContain("RON");
  });
  it("has all four languages for every static marked string", () => {
    boot();
    document.querySelectorAll("*").forEach((el) =>
      [...el.attributes]
        .filter((attr) => attr.name.startsWith("data-i18n"))
        .forEach((attr) => {
          expect(win["HopperMessages"][attr.value], attr.value).toHaveLength(3);
        }),
    );
  });
});

describe("Local and online synchronization", () => {
  it("works locally when configuration or library is missing and never uploads credentials or photos", async () => {
    boot();
    const before = localStorage.getItem("expenses_users");
    await api().connect(false);
    expect(document.getElementById("cloud-status")?.textContent).toContain("configurarea");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    const value = api().snapshot(user);
    expect(value.password).toBeUndefined();
    expect(value.profilePhoto).toBeUndefined();
    expect(value.email).toBeUndefined();
    expect(value.customField).toBeUndefined();
    expect(api().applySnapshot(user, { ...value, name: "New" }).customField).toBe("keep");
    expect(api().applySnapshot(user, { ...value, name: "New" }).profilePhoto).toBe(
      user.profilePhoto,
    );
  });
  it("syncs independent category removals and restoration without changing financial records", () => {
    boot();
    const localUser = structuredClone(user);
    api().identifyRecords(localUser, true);
    const base = { ...api().snapshot(localUser), hiddenCategories: {} };
    const merged = api().mergeSnapshots(
      base,
      { ...base, hiddenCategories: { Food: true } },
      { ...base, hiddenCategories: { Transport: true } },
    );
    expect(merged.conflicts).toEqual([]);
    expect(merged.data.hiddenCategories).toEqual({ Food: true, Transport: true });
    expect(() => api().validateSnapshot(merged.data)).not.toThrow();
    const applied = api().applySnapshot(localUser, merged.data);
    expect(applied.expenses).toEqual(localUser.expenses);
    expect(applied.profilePhoto).toBe(user.profilePhoto);
    expect(applied.customField).toBe(user.customField);
    const restored = api().mergeSnapshots(
      merged.data,
      { ...merged.data, hiddenCategories: {} },
      { ...merged.data, name: "New" },
    );
    expect(restored.conflicts).toEqual([]);
    expect(restored.data.hiddenCategories).toEqual({});
    expect(restored.data.name).toBe("New");
  });
  it("combines independent additions and deletions, retaining unknown local metadata", () => {
    boot();
    const base = { expenses: [{ id: "one", description: "A", amount: 5 }] };
    const local = { expenses: [] };
    const remote = { expenses: [...base.expenses, { id: "two", description: "B", amount: 7 }] };
    expect(api().mergeSnapshots(base, local, remote)).toEqual({
      data: { expenses: [remote.expenses[1]] },
      conflicts: [],
    });
    const conflict = api().mergeSnapshots(base, local, {
      expenses: [{ ...base.expenses[0], amount: 9 }],
    });
    expect(conflict.conflicts).toEqual(["expenses.one"]);
  });
  it("combines simultaneous savings contributions without double counting retries", () => {
    boot();
    const goal = { name: "Laptop", target: 100, saved: 10 };
    const base = { savingsGoals: { RON: goal }, savingsContributions: [] };
    const local = {
      savingsGoals: { RON: { ...goal, saved: 15 } },
      savingsContributions: [{ id: "left", amount: 5, currency: "RON" }],
    };
    const remote = {
      savingsGoals: { RON: { ...goal, saved: 17 } },
      savingsContributions: [{ id: "right", amount: 7, currency: "RON" }],
    };
    const merged = api().mergeSnapshots(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.data.savingsGoals.RON.saved).toBe(22);
    expect(api().mergeSnapshots(base, local, merged.data).data.savingsGoals.RON.saved).toBe(22);
  });
  it("refuses competing budget edits and only replaces conflicting fields when explicitly resolved", () => {
    boot();
    const result = api().mergeSnapshots(
      { monthlyBudget: 100 },
      { monthlyBudget: 150, name: "Ana" },
      { monthlyBudget: 200, theme: "night" },
    );
    expect(result.conflicts).toEqual(["monthlyBudget"]);
    expect(
      api().mergeSnapshots(
        { monthlyBudget: 100 },
        { monthlyBudget: 150, name: "Ana" },
        { monthlyBudget: 200, theme: "night" },
        "remote",
      ).data,
    ).toEqual({ monthlyBudget: 200, name: "Ana", theme: "night" });
  });
  it("assigns deterministic IDs to legacy duplicates, rejects malformed online records", () => {
    boot();
    const left = api().identifyRecords(
      { expenses: [user.expenses[0], { ...user.expenses[0] }].map((item) => ({ ...item })) },
      true,
    );
    const right = api().identifyRecords(
      { expenses: [user.expenses[0], { ...user.expenses[0] }].map((item) => ({ ...item })) },
      true,
    );
    expect(left).toEqual(right);
    expect(left.expenses[0].id).not.toBe(left.expenses[1].id);
    expect(() => api().validateSnapshot({ password: "no" })).toThrow();
    expect(() => api().validateSnapshot({ hiddenCategories: { Food: "yes" } })).toThrow();
    expect(() => api().validateSnapshot({ hiddenCategories: { unexpected: true } })).toThrow();
    expect(() => api().validateSnapshot({ expenses: [{ id: "x", amount: "bad" }] })).toThrow();
  });
  it("delegates the old hidden login to mandatory MFA without linking or uploading financial data", async () => {
    const cloud = fakeCloud();
    boot(user, true, cloud.sdk);
    set("cloud-email", user.email);
    set("cloud-password", "test-only");
    await api().connect(false);
    expect(win["HopperAuth"].signIn).toHaveBeenCalledWith({
      email: user.email,
      password: "test-only",
    });
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(stored().cloudAccountId).toBeUndefined();
    expect((document.getElementById("cloud-password") as HTMLInputElement).value).toBe("");
  });

  it("uploads after linking, downloads remote changes, and queues offline changes", async () => {
    const cloud = fakeCloud();
    boot(user, true, cloud.sdk);
    await link();
    expect(cloud.row()?.data.expenses).toHaveLength(1);
    expect(cloud.row()?.data.password).toBeUndefined();
    expect(cloud.row()?.data.profilePhoto).toBeUndefined();
    expect(stored().customField).toBe("keep");
    expect(stored().profilePhoto).toBe(user.profilePhoto);
    const row = cloud.row();
    cloud.change({
      revision: row.revision + 1,
      data: {
        ...row.data,
        expenses: [
          ...row.data.expenses,
          {
            id: "phone",
            description: "Phone lunch",
            category: "Food",
            amount: 10,
            currency: "RON",
            date: "2026-10-03",
          },
        ],
      },
    });
    await api().synchronize();
    expect(stored().expenses).toHaveLength(2);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const before = cloud.rpc.mock.calls.length;
    set("description", "Offline bus");
    set("amount", "8");
    document
      .getElementById("expense-form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await api().synchronize();
    expect(cloud.rpc.mock.calls.length).toBe(before);
    expect(stored().expenses).toHaveLength(3);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await api().synchronize();
    expect(cloud.row()?.data.expenses).toHaveLength(3);
  });
  it("retries a stale revision and ignores a pending response after logout", async () => {
    const cloud = fakeCloud();
    boot(user, true, cloud.sdk);
    await link();
    const stale = cloud.row();
    cloud.rpc.mockImplementationOnce(async () => {
      cloud.change({ revision: stale.revision + 1, data: { ...stale.data, theme: "night" } });
      return { data: [], error: null };
    });
    const current = stored();
    current.name = "Updated";
    win["HopperApp"].applyCloud(current);
    await api().synchronize();
    expect(cloud.row()?.data.name).toBe("Updated");
    expect(stored().theme).toBe("night");
    let resolve!: (value: any) => void;
    cloud.select.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = api().synchronize();
    document.getElementById("logout-button")!.click();
    resolve({
      data: { revision: 99, data: { ...cloud.row().data, name: "Must not restore" } },
      error: null,
    });
    await pending;
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
  });
  it("does not upload unchanged data merely because Postgres reordered JSON keys", async () => {
    const cloud = fakeCloud();
    boot(user, true, cloud.sdk);
    await link();
    const row = cloud.row();
    cloud.change({ ...row, data: Object.fromEntries(Object.entries(row.data).reverse()) });
    const calls = cloud.rpc.mock.calls.length;
    await api().synchronize();
    expect(cloud.rpc.mock.calls.length).toBe(calls);
  });
  it("keeps display currency local so a remote preference cannot relabel unsaved amounts", () => {
    boot();
    expect(api().snapshot(user).currency).toBeUndefined();
    expect(api().applySnapshot({ ...user, currency: "EUR" }, api().snapshot(user)).currency).toBe(
      "EUR",
    );
  });
  it("retains local edits if the cloud is unavailable after connection", async () => {
    const cloud = fakeCloud();
    boot(user, true, cloud.sdk);
    await link();
    cloud.select.mockRejectedValueOnce(new Error("network unavailable"));
    const current = stored();
    current.monthlyBudget = 200;
    win["HopperApp"].applyCloud(current);
    await api().synchronize();
    expect(stored().monthlyBudget).toBe(200);
    expect(document.getElementById("sync-status")?.textContent).toContain(
      "Datele locale sunt păstrate",
    );
  });
});
