import { installAuthenticatedSession } from "./helpers/authenticated-app";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("mobile/app/index.html", "utf8");
const script = readFileSync("mobile/app/script.js", "utf8");
const legacyUser = {
  name: "Ana",
  email: "student@example.test",
  password: "test-password",
  expenses: [
    { description: "Cantină", category: "Mâncare", amount: 40, date: "2026-10-01T10:00:00Z" },
    { description: "Internet", category: "Facturi", amount: 50, date: "2026-09-15T10:00:00Z" },
  ],
  customField: "preserve-me",
};

function start(user: object = legacyUser, categoryPicker = false) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  mockDialog("transaction-editor");
  mockDialog("day-details");
  mockDialog("category-manager");
  if (categoryPicker) mockDialog("expense-category-picker");
  localStorage.setItem("expenses_users", JSON.stringify([user]));
  localStorage.setItem("expenses_current_user", JSON.stringify(user));
  installAuthenticatedSession();
  new Function("document", "localStorage", "alert", script)(document, localStorage, vi.fn());
}

function field(id: string, value: string) {
  (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value = value;
}

function submit(id: string) {
  document
    .getElementById(id)!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function text(id: string) {
  return document.getElementById(id)!.textContent;
}

function money(amount: number, currency = "RON") {
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency }).format(amount);
}

function savedUser() {
  return JSON.parse(localStorage.getItem("expenses_users")!)[0];
}

// jsdom has no native dialog implementation; emulate opening and closing only.
function mockDialog(id = "date-picker") {
  const dialog = document.getElementById(id) as HTMLDialogElement;
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  });
  return dialog;
}

function pickerDay(date: string) {
  return document.querySelector(`#date-picker-days [data-date="${date}"]`) as HTMLButtonElement;
}

const testPhoto = "data:image/jpeg;base64,dGVzdC1waG90bw==";

function choosePhoto(file: File) {
  const input = document.getElementById("profile-photo-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function mockPhotoProcessing(deferred = false) {
  const images: DecodedImage[] = [];
  class DecodedImage {
    naturalWidth = 800;
    naturalHeight = 600;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      images.push(this);
    }
    set src(_value: string) {
      if (!deferred) this.onload?.();
    }
  }
  vi.stubGlobal("Image", DecodedImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(testPhoto);
  return images;
}

describe("Student budget", () => {
  it("opens My budget from the Hopper name without saving data or discarding drafts", () => {
    start();
    field("description", "An unfinished expense");
    field("amount", "35");
    const accounts = localStorage.getItem("expenses_users");
    const session = localStorage.getItem("expenses_current_user");
    const name = document.querySelector(".hopper-brand-name")!;
    const button = name.closest("button")!;
    expect(button.type).toBe("button");
    for (const view of ["report", "goals", "settings"]) {
      document.querySelector<HTMLButtonElement>(`.view-tab[data-view="${view}"]`)!.click();
      name.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(document.querySelector('.page-view[data-view="home"]')).toHaveClass("active");
      expect(document.querySelectorAll(".page-view.active")).toHaveLength(1);
      expect(document.querySelector('.view-tab[data-view="home"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
    expect(localStorage.getItem("expenses_users")).toBe(accounts);
    expect(localStorage.getItem("expenses_current_user")).toBe(session);
    expect((document.getElementById("description") as HTMLInputElement).value).toBe(
      "An unfinished expense",
    );
    expect((document.getElementById("amount") as HTMLInputElement).value).toBe("35");
  });

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("restores legacy expenses without changing saved records and filters by month", () => {
    start();
    expect(text("monthly-expenses")).toBe(money(40));
    expect(document.querySelector('[data-category="Food"] .legend-percent')!.textContent).toBe(
      "100%",
    );
    expect(document.querySelector('[data-view="home"].page-view')!.firstElementChild).toHaveClass(
      "expense-overview",
    );
    expect(text("report-list")).toContain("Cantină");
    expect(text("report-list")).not.toContain("Internet");
    document.getElementById("prev-month")!.click();
    expect(text("monthly-expenses")).toBe(money(50));
    expect(document.querySelector('[data-category="Bills"] .legend-percent')!.textContent).toBe(
      "100%",
    );
    expect(savedUser()).toEqual(legacyUser);
  });

  function earnedBadges() {
    return [...document.querySelectorAll<HTMLElement>(".achievement.earned")].map(
      (item) => item.dataset["badge"],
    );
  }

  it("celebrates newly earned badges once, groups simultaneous unlocks and dismisses the notification", () => {
    vi.useFakeTimers();
    start({ ...legacyUser, expenses: [], savingsGoal: { name: "Laptop", target: 100, saved: 0 } });
    expect(document.getElementById("achievement-notification")).not.toHaveClass("visible");
    const events: { kind: string; target: string }[] = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.kind.startsWith("achievement-")) events.push(detail);
    };
    document.addEventListener("hopper:ui", listener);
    try {
      field("savings-saved", "50");
      submit("savings-contribution-form");
      expect(
        events.filter(({ kind }) => kind === "achievement-unlocked").map(({ target }) => target),
      ).toEqual(["achievement-first-saving", "achievement-goal-quarter", "achievement-goal-half"]);
      expect(events.filter(({ kind }) => kind === "achievement-celebration")).toEqual([
        { kind: "achievement-celebration", target: "achievement-notification" },
      ]);
      expect(document.getElementById("achievement-notification")).toHaveClass("visible");
      expect(text("achievement-notification-message")).toContain("Prima economie");
      expect(text("achievement-notification-message")).toContain("2");
      expect(document.querySelector("#achievement-notification-icon svg")).not.toBeNull();
      const before = localStorage.getItem("expenses_users");
      const count = events.length;
      document.getElementById("achievements-next")!.click();
      document.querySelector<HTMLButtonElement>('.view-tab[data-view="goals"]')!.click();
      document.getElementById("prev-month")!.click();
      expect(events).toHaveLength(count);
      expect(localStorage.getItem("expenses_users")).toBe(before);
      vi.advanceTimersByTime(4500);
      expect(document.getElementById("achievement-notification")).not.toHaveClass("visible");
      expect(events.at(-1)?.kind).toBe("achievement-dismissed");
      start(savedUser());
      expect(document.getElementById("achievement-notification")).not.toHaveClass("visible");
      expect(events).toHaveLength(count + 1);
    } finally {
      document.removeEventListener("hopper:ui", listener);
    }
  });

  it("does not celebrate a failed save and clears a successful notification on logout", () => {
    start({ ...legacyUser, expenses: [], savingsGoal: { name: "Laptop", target: 100, saved: 0 } });
    const before = localStorage.getItem("expenses_users");
    const original = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "expenses_current_user") throw new Error("quota");
      original.call(this, key, value);
    });
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(document.getElementById("achievement-notification")).not.toHaveClass("visible");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    storage.mockRestore();
    submit("savings-contribution-form");
    expect(document.getElementById("achievement-notification")).toHaveClass("visible");
    document.getElementById("logout-button")!.click();
    expect(document.getElementById("achievement-notification")).not.toHaveClass("visible");
  });

  it("shows four achievements at a time, with a unique vector symbol on every card", () => {
    start({ ...legacyUser, expenses: [] });
    const cards = [...document.querySelectorAll<HTMLElement>(".achievement")];
    expect(cards).toHaveLength(19);
    const symbols = cards.map((card) =>
      card.querySelector(".achievement-icon svg path")!.getAttribute("d"),
    );
    expect(symbols.every(Boolean)).toBe(true);
    expect(new Set(symbols).size).toBe(19);
    expect(cards.filter((card) => !card.hidden).map((card) => card.dataset["badge"])).toEqual([
      "first-saving",
      "goal-reached",
      "organized-month",
      "goal-quarter",
    ]);
    expect(document.getElementById("achievements-prev")).toBeDisabled();
    expect(document.getElementById("achievements-next")).not.toBeDisabled();
    expect(text("achievements-page-status")).toContain("1\u20134 din 19");
  });

  it("pages through every achievement without saving data and keeps navigation focused at each end", () => {
    start({ ...legacyUser, expenses: [] });
    const beforeUsers = localStorage.getItem("expenses_users");
    const beforeCurrent = localStorage.getItem("expenses_current_user");
    const cards = [...document.querySelectorAll<HTMLElement>(".achievement")];
    const next = document.getElementById("achievements-next") as HTMLButtonElement;
    const prev = document.getElementById("achievements-prev") as HTMLButtonElement;
    for (let page = 1; page < 5; page++) {
      next.click();
      expect(cards.filter((card) => !card.hidden)).toEqual(cards.slice(page * 4, page * 4 + 4));
    }
    expect(text("achievements-page-status")).toContain("17\u201319 din 19");
    expect(next).toBeDisabled();
    expect(document.activeElement).toBe(prev);
    next.click();
    expect(cards.filter((card) => !card.hidden)).toHaveLength(3);
    for (let page = 3; page >= 0; page--) {
      prev.click();
      expect(cards.filter((card) => !card.hidden)).toEqual(cards.slice(page * 4, page * 4 + 4));
    }
    expect(prev).toBeDisabled();
    expect(document.activeElement).toBe(next);
    expect(localStorage.getItem("expenses_users")).toBe(beforeUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(beforeCurrent);
  });

  it("retains the selected group when savings refresh and resets it for another account", () => {
    start({ ...legacyUser, expenses: [], savingsGoal: { name: "Laptop", target: 100, saved: 0 } });
    document.getElementById("achievements-next")!.click();
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(text("achievements-page-status")).toContain("5\u20138 din 19");
    expect(document.querySelector('.achievement[data-badge="goal-half"]')).not.toHaveAttribute(
      "hidden",
    );
    expect(document.querySelector('.achievement[data-badge="goal-half"]')).toHaveClass("earned");
    const before = localStorage.getItem("expenses_users");
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="settings"]')!.click();
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="goals"]')!.click();
    expect(text("achievements-page-status")).toContain("5\u20138 din 19");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    start({ ...legacyUser, email: "different@example.test", expenses: [] });
    expect(text("achievements-page-status")).toContain("1\u20134 din 19");
    expect(document.querySelectorAll(".achievement:not([hidden])")).toHaveLength(4);
  });

  it.each([
    ["goal-quarter", 25],
    ["goal-half", 50],
    ["goal-three-quarters", 75],
    ["goal-ninety", 90],
  ])("unlocks %s at its exact savings threshold without changing saved data", (id, threshold) => {
    const target = Number(threshold);
    start({
      ...legacyUser,
      expenses: [],
      savingsGoal: { name: "Laptop", target: 100, saved: target - 0.01 },
    });
    expect(earnedBadges()).not.toContain(id);
    start({
      ...legacyUser,
      expenses: [],
      savingsGoal: { name: "Laptop", target: 100, saved: target },
    });
    expect(earnedBadges()).toContain(id);
    const before = localStorage.getItem("expenses_users");
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="goals"]')!.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.querySelectorAll(".achievement")).toHaveLength(19);
  });

  it("counts valid contributions and distinct days, ignoring missing, invalid and future dates", () => {
    const contributions = Array.from({ length: 10 }, (_, index) => ({
      amount: 1,
      date: `2026-10-0${(index % 3) + 1}`,
    }));
    start({ ...legacyUser, expenses: [], savingsContributions: contributions });
    expect(earnedBadges()).toEqual(
      expect.arrayContaining(["saving-three", "saving-ten", "saving-days"]),
    );
    start({
      ...legacyUser,
      expenses: [],
      savingsContributions: [
        { amount: 1, date: "2026-10-01" },
        { amount: 1, date: "2026-10-01" },
        { amount: 1, date: "2026-10-04" },
        { amount: 1, date: "2026-02-30" },
        { amount: -1, date: "2026-10-02" },
        { amount: 1 },
        { amount: 1, date: "invalid" },
      ],
    });
    expect(earnedBadges()).not.toEqual(expect.arrayContaining(["saving-three"]));
    expect(earnedBadges()).not.toContain("saving-days");
  });

  it("handles Monday-based weeks and consecutive months across years without mixing currencies", () => {
    start({
      ...legacyUser,
      expenses: [],
      savingsContributions: [
        { amount: 10, date: "2025-12-29" },
        { amount: 10, date: "2026-01-05" },
        { amount: 10, date: "2026-02-01" },
      ],
    });
    expect(earnedBadges()).toEqual(expect.arrayContaining(["saving-weeks", "saving-months"]));
    start({
      ...legacyUser,
      expenses: [],
      savingsContributions: [
        { amount: 10, date: "2026-09-28" },
        { amount: 10, date: "2026-10-03" },
        { amount: 10, date: "2026-08-01", currency: "EUR" },
        { amount: 10, date: "2026-09-01", currency: "EUR" },
        { amount: 10, date: "2026-10-01", currency: "USD" },
      ],
    });
    expect(earnedBadges()).not.toContain("saving-weeks");
    expect(earnedBadges()).not.toContain("saving-months");
  });

  it("earns savings ratios from gross monthly income in one currency, without a zero-income shortcut", () => {
    for (const [saved, expected] of [
      [49.99, []],
      [50, ["saving-five-percent"]],
      [100, ["saving-five-percent", "saving-ten-percent"]],
    ] as const) {
      start({
        ...legacyUser,
        expenses: [],
        incomes: [{ amount: 1000, date: "2026-10-01" }],
        savingsContributions: [{ amount: saved, date: "2026-10-02" }],
      });
      expect(earnedBadges().filter((id) => id?.endsWith("-percent"))).toEqual(expected);
    }
    for (const incomes of [
      [],
      [{ amount: 1000, date: "2026-09-01" }],
      [{ amount: 1000, date: "2026-10-01", currency: "EUR" }],
    ]) {
      start({
        ...legacyUser,
        expenses: [],
        incomes,
        savingsContributions: [{ amount: 100, date: "2026-10-02" }],
      });
      expect(earnedBadges()).not.toContain("saving-five-percent");
      expect(earnedBadges()).not.toContain("saving-ten-percent");
    }
  });

  it("checks money left only in completed months and deducts savings in the matching currency", () => {
    const records = {
      ...legacyUser,
      expenses: [{ amount: 50, date: "2026-09-01", category: "Food" }],
      incomes: [{ amount: 100, date: "2026-09-01" }],
    };
    start({ ...records, savingsContributions: [{ amount: 50, date: "2026-09-02" }] });
    expect(earnedBadges()).not.toContain("money-left");
    start({ ...records, savingsContributions: [{ amount: 49.99, date: "2026-09-02" }] });
    expect(earnedBadges()).toContain("money-left");
    start({ ...legacyUser, expenses: [], incomes: [{ amount: 100, date: "2026-10-01" }] });
    expect(earnedBadges()).not.toContain("money-left");
    start({
      ...records,
      savingsContributions: [{ amount: 1000, date: "2026-09-02", currency: "EUR" }],
    });
    expect(earnedBadges()).toContain("money-left");
  });

  it("recognizes a return after 30 calendar days only within one currency", () => {
    for (const [date, earned] of [
      ["2026-09-30", false],
      ["2026-10-01", true],
    ] as const) {
      start({
        ...legacyUser,
        expenses: [],
        savingsContributions: [
          { amount: 10, date: "2026-09-01" },
          { amount: 10, date },
        ],
      });
      expect(earnedBadges().includes("saving-return")).toBe(earned);
    }
    start({
      ...legacyUser,
      expenses: [],
      savingsContributions: [
        { amount: 10, date: "2026-09-01" },
        { amount: 10, date: "2026-10-01", currency: "EUR" },
      ],
    });
    expect(earnedBadges()).not.toContain("saving-return");
  });

  it("creates account-local categories that work in entry, charts and editing, without accepting duplicates", () => {
    start({
      ...legacyUser,
      expenses: [{ description: "Hobby", category: "unknown", amount: 10, date: "2026-10-01" }],
    });
    expect(earnedBadges()).not.toContain("categorized");
    const categoryForm = document.getElementById("custom-category-form")!;
    expect(categoryForm.previousElementSibling?.id).toBe("expense-form");
    expect(categoryForm.closest('.page-view[data-view="home"]')).not.toBeNull();
    expect(
      document.querySelector('.page-view[data-view="settings"] #custom-category-form'),
    ).toBeNull();
    field("custom-category-name", "Hobby-uri");
    submit("custom-category-form");
    const category = savedUser().customCategories[0];
    expect(earnedBadges()).toContain("custom-category");
    expect(text("companion-message")).toContain("Pe stilul t\u0103u");
    const saved = localStorage.getItem("expenses_users");
    field("custom-category-name", "HOBBY-URI");
    submit("custom-category-form");
    expect(localStorage.getItem("expenses_users")).toBe(saved);
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="report"]')!.click();
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    field("edit-category", category.id);
    submit("transaction-edit-form");
    expect(savedUser().expenses[0].category).toBe(category.id);
    expect(earnedBadges()).toContain("categorized");
    expect(
      document.querySelector(`#category-totals [data-category="${category.id}"]`)!.textContent,
    ).toContain("Hobby-uri");
    expect(
      document.querySelector(`#expense-legend [data-category="${category.id}"] .legend-percent`)!
        .textContent,
    ).toBe("100%");
    expect(text("report-list")).toContain("Hobby-uri");
    field("description", "Peinture");
    field("amount", "5");
    field("category", category.id);
    submit("expense-form");
    expect(savedUser().expenses[1].category).toBe(category.id);
    expect(savedUser().customField).toBe("preserve-me");
    start(savedUser());
    expect(
      (document.getElementById("category") as HTMLSelectElement).querySelector(
        `option[value="${category.id}"]`,
      ),
    ).not.toBeNull();
    start({ ...legacyUser, email: "other@example.test", expenses: [] });
    expect(document.querySelector(`option[value="${category.id}"]`)).toBeNull();
    expect(earnedBadges()).not.toContain("custom-category");
    expect(earnedBadges()).not.toContain("categorized");
  });

  it("removes built-in and custom choices while preserving historical labels, amounts and corrections", () => {
    const category = { id: "custom-hobby", label: "Hobby-uri", note: "keep" };
    const expenses = [
      {
        description: "Cantină",
        category: "Mâncare",
        amount: 40,
        date: "2026-10-01",
        note: "legacy",
      },
      {
        description: "Pensule",
        category: category.id,
        amount: 12,
        date: "2026-10-02",
        currency: "RON",
      },
    ];
    start({ ...legacyUser, expenses, customCategories: [category] });
    document.getElementById("manage-categories")!.click();
    const dialog = document.getElementById("category-manager") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-remove-category="Food"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-remove-category="custom-hobby"]')!.click();
    expect(savedUser().hiddenCategories).toEqual({ Food: true, "custom-hobby": true });
    expect(savedUser().expenses).toEqual(expenses);
    expect(savedUser().customCategories).toEqual([category]);
    expect(savedUser().customField).toBe("preserve-me");
    for (const id of ["Food", "custom-hobby"]) {
      expect(document.querySelector(`#category option[value="${id}"]`)).toBeNull();
      expect(document.querySelector(`[data-remove-category="${id}"]`)).toBeNull();
      expect(document.querySelector(`#category-totals [data-category="${id}"]`)).not.toBeNull();
    }
    expect(text("monthly-expenses")).toBe(money(52));
    expect(text("report-list")).toContain("Hobby-uri");
    expect(text("report-list")).toContain("Mâncare");
    document.querySelector<HTMLButtonElement>('[data-close-dialog="category-manager"]')!.click();
    expect(document.activeElement).toBe(document.getElementById("manage-categories"));
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="report"]')!.click();
    document.querySelector<HTMLButtonElement>('.edit-transaction-button[data-index="1"]')!.click();
    expect((document.getElementById("edit-category") as HTMLSelectElement).value).toBe(
      "custom-hobby",
    );
    field("edit-amount", "15");
    submit("transaction-edit-form");
    expect(savedUser().expenses[1]).toEqual({ ...expenses[1], amount: 15 });
    expect(savedUser().hiddenCategories["custom-hobby"]).toBe(true);
    const current = savedUser();
    start(current);
    expect(document.querySelector('#category option[value="Food"]')).toBeNull();
    expect(savedUser()).toEqual(current);
  });

  it("hides unused chart categories, preserves the remaining selection and restores choices without changing records", () => {
    start({
      ...legacyUser,
      expenses: [],
      customCategories: [{ id: "custom-one", label: "Hobby-uri" }],
    });
    field("description", "Text nesalvat");
    field("amount", "25");
    field("category", "Housing");
    document.querySelector<HTMLButtonElement>('#category-totals [data-category="Food"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-remove-category="Food"]')!.click();
    expect(document.querySelector('#category-totals [data-category="Food"]')).toBeNull();
    expect(document.querySelector('#expense-legend [data-category="Food"]')).toBeNull();
    expect(text("category-chart-detail")).toContain("Alege o bară");
    expect((document.getElementById("category") as HTMLSelectElement).value).toBe("Housing");
    expect((document.getElementById("description") as HTMLInputElement).value).toBe(
      "Text nesalvat",
    );
    document.querySelector<HTMLButtonElement>('[data-remove-category="custom-one"]')!.click();
    const records = savedUser().expenses;
    document.getElementById("restore-categories")!.click();
    expect(savedUser().hiddenCategories).toEqual({});
    expect(savedUser().expenses).toEqual(records);
    expect(document.querySelector('#category option[value="Food"]')).not.toBeNull();
    expect(document.querySelector('#category option[value="custom-one"]')).not.toBeNull();
  });

  it("never auto-detects a removed category and prevents saving when all choices are removed", () => {
    start({ ...legacyUser, expenses: [] });
    document.querySelector<HTMLButtonElement>('[data-remove-category="Food"]')!.click();
    field("description", "Cantină");
    field("amount", "10");
    submit("expense-form");
    expect(savedUser().expenses[0].category).toBe("Other");
    while (document.querySelector("[data-remove-category]")) {
      document.querySelector<HTMLButtonElement>("[data-remove-category]")!.click();
    }
    const before = localStorage.getItem("expenses_users");
    field("description", "Carte");
    field("amount", "5");
    submit("expense-form");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(text("category-error")).toContain("restabilește");
    expect(document.activeElement).toBe(document.getElementById("category"));
    expect(document.getElementById("category-manager-empty")).not.toHaveAttribute("hidden");
    expect(text("monthly-expenses")).toBe(money(10));
    field("custom-category-name", "Hobby-uri");
    submit("custom-category-form");
    expect(earnedBadges()).toContain("custom-category");
    field("category", savedUser().customCategories[0].id);
    submit("expense-form");
    expect(savedUser().expenses).toHaveLength(2);
  });

  it("reuses a removed custom identity and keeps category changes private to the account", () => {
    start({
      ...legacyUser,
      expenses: [],
      customCategories: [{ id: "custom-one", label: "Hobby-uri" }],
    });
    const stale = document.querySelector<HTMLButtonElement>('[data-remove-category="Food"]')!;
    document.querySelector<HTMLButtonElement>('[data-remove-category="custom-one"]')!.click();
    field("custom-category-name", "HOBBY-URI");
    submit("custom-category-form");
    expect(savedUser().customCategories).toEqual([{ id: "custom-one", label: "Hobby-uri" }]);
    expect(savedUser().hiddenCategories).toEqual({});
    start({ ...legacyUser, email: "other@example.test", expenses: [] });
    const before = localStorage.getItem("expenses_users");
    stale.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.querySelector('#category option[value="Food"]')).not.toBeNull();
    expect(document.querySelector('#category option[value="custom-one"]')).toBeNull();
  });

  it("rolls back failed category deletion and restoration and retains the displayed choices", () => {
    start({ ...legacyUser, expenses: [], hiddenCategories: { Housing: true } });
    const beforeUsers = localStorage.getItem("expenses_users");
    const beforeCurrent = localStorage.getItem("expenses_current_user");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "expenses_current_user") throw new Error("quota");
      original.call(this, key, value);
    });
    document.querySelector<HTMLButtonElement>('[data-remove-category="Food"]')!.click();
    expect(text("category-manager-status")).toContain("nu a putut fi eliminată");
    document.getElementById("restore-categories")!.click();
    expect(text("category-manager-status")).toContain("nu au putut fi restabilite");
    expect(localStorage.getItem("expenses_users")).toBe(beforeUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(beforeCurrent);
    expect(document.querySelector('#category option[value="Food"]')).not.toBeNull();
    expect(document.querySelector('#category option[value="Housing"]')).toBeNull();
  });

  it("keeps failed category saves atomic and retains the typed name", () => {
    start({ ...legacyUser, expenses: [] });
    const before = localStorage.getItem("expenses_users");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "expenses_current_user") throw new Error("quota");
      original.call(this, key, value);
    });
    field("custom-category-name", "Hobby");
    submit("custom-category-form");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(earnedBadges()).not.toContain("custom-category");
    expect((document.getElementById("custom-category-name") as HTMLInputElement).value).toBe(
      "Hobby",
    );
  });

  it("preserves completed goals and badges while starting and finishing a distinct second goal", () => {
    start({
      ...legacyUser,
      expenses: [],
      incomes: [{ source: "Job", amount: 1000, date: "2026-10-01" }],
      savingsGoal: { name: "Laptop", target: 100, saved: 90, note: "keep" },
    });
    field("savings-saved", "10");
    submit("savings-contribution-form");
    expect(savedUser().completedSavingsGoals).toHaveLength(1);
    field("savings-saved", "5");
    submit("savings-contribution-form");
    expect(savedUser().completedSavingsGoals).toHaveLength(1);
    expect(earnedBadges()).not.toContain("second-goal");
    const before = localStorage.getItem("expenses_users");
    document.getElementById("savings-new-goal")!.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.getElementById("savings-saved")).toBeDisabled();
    document.getElementById("savings-cancel-new-goal")!.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.getElementById("savings-saved")).not.toBeDisabled();
    document.getElementById("savings-new-goal")!.click();
    field("savings-name", "Vacanta");
    field("savings-target", "50");
    submit("savings-form");
    expect(savedUser().savingsGoal).toEqual({ name: "Vacanta", target: 50, saved: 0 });
    expect(savedUser().completedSavingsGoals[0]).toMatchObject({
      name: "Laptop",
      target: 100,
      saved: 105,
      note: "keep",
      currency: "RON",
    });
    expect(earnedBadges()).toContain("goal-ninety");
    expect(text("monthly-income")).toBe(money(985));
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(savedUser().completedSavingsGoals).toHaveLength(2);
    expect(earnedBadges()).toContain("second-goal");
    expect(savedUser().savingsContributions).toHaveLength(3);
    expect(text("monthly-income")).toBe(money(935));
    expect(savedUser().incomes[0].amount).toBe(1000);
    expect(savedUser().customField).toBe("preserve-me");
    start(savedUser());
    expect(earnedBadges()).toContain("second-goal");
    const reloaded = localStorage.getItem("expenses_users");
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="goals"]')!.click();
    document.getElementById("companion-next")!.click();
    expect(localStorage.getItem("expenses_users")).toBe(reloaded);
  });

  it("does not count editing a reached goal as a second goal and keeps a failed new-goal draft", () => {
    start({
      ...legacyUser,
      expenses: [],
      savingsGoal: { name: "Laptop", target: 100, saved: 100 },
    });
    field("savings-name", "Laptop nou");
    submit("savings-form");
    field("savings-target", "50");
    submit("savings-form");
    expect(savedUser().completedSavingsGoals).toHaveLength(1);
    expect(earnedBadges()).not.toContain("second-goal");
    document.getElementById("savings-new-goal")!.click();
    const before = localStorage.getItem("expenses_users");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "expenses_current_user") throw new Error("quota");
      original.call(this, key, value);
    });
    field("savings-name", "Vacanta");
    field("savings-target", "200");
    submit("savings-form");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(savedUser().completedSavingsGoals).toHaveLength(1);
    expect((document.getElementById("savings-name") as HTMLInputElement).value).toBe("Vacanta");
    expect(document.getElementById("savings-saved")).toBeDisabled();
    expect(earnedBadges()).not.toContain("second-goal");
  });

  it("uses the normal Romanian title without a CSS-built letter or comma", () => {
    start({ ...legacyUser, expenses: [] });
    expect(text("badges-title")).toBe("Micile tale reu\u0219ite");
    expect(document.querySelector("#badges-title .pixel-comma-letter")).toBeNull();
  });

  it("warns next to a missing income amount and saves only after it is completed", () => {
    start();
    const amount = document.getElementById("income-amount") as HTMLInputElement;
    const before = localStorage.getItem("expenses_users");
    (document.getElementById("income-form") as HTMLFormElement).requestSubmit();
    expect(text("income-amount-error")).toBe("Completează suma.");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAttribute("aria-describedby", "income-amount-error");
    expect(document.activeElement).toBe(amount);
    expect(localStorage.getItem("expenses_users")).toBe(before);
    submit("income-form");
    expect(document.querySelectorAll("#income-amount-error")).toHaveLength(1);
    field("income-amount", "800");
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("income-amount-error")).toHaveAttribute("hidden");
    expect(amount).not.toHaveAttribute("aria-invalid");
    submit("income-form");
    expect(text("monthly-income")).toBe(money(800));
    expect(savedUser().incomes).toHaveLength(1);
    expect(savedUser().expenses).toEqual(legacyUser.expenses);
  });

  it("marks all missing expense fields, preserves completed fields and focuses the first error", () => {
    start();
    submit("expense-form");
    expect(text("description-error")).toBe("Completează ce ai cumpărat.");
    expect(text("amount-error")).toBe("Completează suma.");
    expect(document.activeElement).toBe(document.getElementById("description"));
    expect(savedUser()).toEqual(legacyUser);
    field("description", "Cantină");
    document.getElementById("description")!.dispatchEvent(new Event("input", { bubbles: true }));
    submit("expense-form");
    expect((document.getElementById("description") as HTMLInputElement).value).toBe("Cantină");
    expect(document.getElementById("description-error")).toHaveAttribute("hidden");
    expect(document.activeElement).toBe(document.getElementById("amount"));
    field("amount", "20");
    submit("expense-form");
    expect(savedUser().expenses.at(-1)).toMatchObject({ description: "Cantină", amount: 20 });
    expect(document.getElementById("amount-error")).toHaveAttribute("hidden");
  });

  it.each([
    ["budget-form", "monthly-budget", "Completează limita lunară."],
    ["savings-form", "savings-name", "Completează numele obiectivului."],
    ["savings-form", "savings-target", "Completează ținta obiectivului."],
    ["savings-contribution-form", "savings-saved", "Completează suma de adăugat."],
    ["profile-form", "profile-name", "Completează numele."],
  ])(
    "warns about a missing field in %s without saving incomplete data",
    (formId, fieldId, message) => {
      start({ ...legacyUser, savingsGoal: { name: "Laptop", target: 1000, saved: 100 } });
      field(fieldId, "");
      const before = localStorage.getItem("expenses_users");
      submit(formId);
      expect(text(`${fieldId}-error`)).toBe(message);
      expect(document.activeElement).toBe(document.getElementById(fieldId));
      expect(localStorage.getItem("expenses_users")).toBe(before);
      if (fieldId === "savings-saved") {
        expect(document.getElementById(fieldId)).toHaveAttribute(
          "aria-describedby",
          "savings-status savings-saved-error",
        );
      }
    },
  );

  it("validates registration fields, rejects whitespace and accepts optional profile fields left empty", () => {
    start();
    document.getElementById("logout-button")!.click();
    document.querySelector<HTMLButtonElement>('[data-target="register-form"]')!.click();
    field("register-name", "   ");
    submit("register-form");
    expect(text("register-name-error")).toBe("Completează numele.");
    expect(text("register-email-error")).toBe("Completează emailul.");
    expect(text("register-password-error")).toBe("Completează parola.");
    expect(savedUser()).toEqual(legacyUser);
    field("register-name", "Alex");
    field("register-email", "invalid");
    field("register-password", "test-password");
    submit("register-form");
    expect(text("register-email-error")).toBe("Introdu o adresă de email validă.");
    start();
    field("profile-university", "");
    field("profile-study-year", "");
    submit("profile-form");
    expect(text("profile-status")).toContain("salvat");
    expect(document.querySelectorAll(".field-error:not([hidden])")).toHaveLength(0);
  });

  it("retains amount constraints and clears stale warnings on account and currency changes", () => {
    start({ ...legacyUser, savingsGoal: { name: "Laptop", target: 1000, saved: 100 } });
    for (const value of ["0", "-5", "0.001"]) {
      field("income-amount", value);
      submit("income-form");
      expect(document.getElementById("income-amount-error")).not.toHaveAttribute("hidden");
      expect(savedUser().incomes).toBeUndefined();
    }
    field("savings-saved", "");
    submit("savings-contribution-form");
    field("settings-currency", "EUR");
    submit("currency-form");
    expect(document.querySelectorAll(".field-error:not([hidden])")).toHaveLength(0);
    expect(document.getElementById("savings-saved")).toHaveAttribute(
      "aria-describedby",
      "savings-status",
    );
    expect(savedUser().savingsGoal.saved).toBe(100);
    document.getElementById("logout-button")!.click();
    field("login-email", legacyUser.email);
    field("login-password", legacyUser.password);
    submit("login-form");
    expect(document.querySelectorAll(".field-error:not([hidden])")).toHaveLength(0);
  });

  it("saves scholarship income, student expenses and a budget with accurate remaining balances", () => {
    start({ ...legacyUser, expenses: [] });
    field("income-source", "Bursă");
    field("income-amount", "800");
    submit("income-form");
    field("monthly-budget", "100");
    submit("budget-form");
    field("description", "Chirie cămin");
    field("amount", "150.25");
    submit("expense-form");
    expect(text("monthly-income")).toBe(money(800));
    expect(text("monthly-expenses")).toBe(money(150.25));
    expect(text("monthly-balance")).toBe(money(649.75));
    expect(text("budget-remaining")).toBe(money(-50.25));
    expect(text("budget-status")).toContain("Ai depășit bugetul");
    expect(savedUser().expenses[0].category).toBe("Housing");
    expect(savedUser().customField).toBe("preserve-me");
    start(savedUser());
    expect(text("monthly-balance")).toBe(money(649.75));
    expect((document.getElementById("monthly-budget") as HTMLInputElement).value).toBe("100");
  });

  it("shows a temporary confirmation while keeping expense rows only in the expenses view", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    start({ ...legacyUser, expenses: [] });
    const panel = document.querySelector(".tracker-panel")!;
    const childCount = panel.children.length;
    const notification = document.getElementById("expense-notification")!;
    expect(notification.textContent).toBe("");
    field("description", "Cantină");
    field("amount", "20");
    submit("expense-form");
    expect(notification).toHaveClass("visible");
    expect(notification.textContent).toBe("Cheltuială adăugată");
    expect(notification).toHaveAttribute("role", "status");
    expect(panel.children).toHaveLength(childCount);
    expect(panel.querySelector("#expense-list, .total-banner")).toBeNull();
    expect(panel.textContent).not.toContain("Cantină");
    expect(text("report-list")).toContain("Cantină");
    expect(text("monthly-expenses")).toBe(money(20));
    expect((document.getElementById("description") as HTMLInputElement).value).toBe("");
    vi.advanceTimersByTime(2500);
    field("description", "Xerox cursuri");
    field("amount", "10");
    submit("expense-form");
    vi.advanceTimersByTime(1000);
    expect(notification).toHaveClass("visible");
    vi.advanceTimersByTime(2499);
    expect(notification).toHaveClass("visible");
    vi.advanceTimersByTime(1);
    expect(notification).not.toHaveClass("visible");
    expect(notification.textContent).toBe("");
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="report"]')!.click();
    expect(document.querySelector('.page-view[data-view="report"]')).toHaveClass("active");
    expect(document.querySelectorAll("#report-list .report-item")).toHaveLength(2);
    expect(text("report-total")).toBe(money(30));
    expect(savedUser().expenses).toHaveLength(2);
    field("description", "Cafea");
    field("amount", "5");
    submit("expense-form");
    document.getElementById("logout-button")!.click();
    expect(notification).not.toHaveClass("visible");
    expect(notification.textContent).toBe("");
    vi.advanceTimersByTime(5000);
    expect(notification.textContent).toBe("");
  });

  it("deletes individual legacy expenses, including duplicates, and refreshes all spending views", () => {
    const duplicate = { description: "Cantină", category: "Food", amount: 10, date: "2026-10-01" };
    const past = legacyUser.expenses[1];
    const euros = {
      description: "Erasmus",
      category: "Education",
      amount: 20,
      date: "2026-10-03",
      currency: "EUR",
    };
    const user = {
      ...legacyUser,
      monthlyBudget: 310,
      incomes: [{ source: "Bursă", amount: 200, date: "2026-10-03" }],
      expenses: [
        past,
        duplicate,
        euros,
        { description: "Chirie", category: "Housing", amount: 75, date: "2026-10-03" },
        { ...duplicate },
      ],
    };
    start(user);
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="report"]')!.click();
    const deleteFirst = () =>
      document.querySelector<HTMLButtonElement>("#report-list .delete-expense-button")!.click();
    expect(text("report-total")).toBe(money(95));
    expect(document.querySelector('[data-date="2026-10-03"]')).toHaveClass("spending-high");
    deleteFirst();
    expect(savedUser().expenses).toEqual([past, duplicate, euros, duplicate]);
    expect(text("expense-notification")).toBe("Cheltuială ștearsă");
    expect(text("report-total")).toBe(money(20));
    expect(text("monthly-expenses")).toBe(money(20));
    expect(text("monthly-balance")).toBe(money(180));
    expect(text("budget-remaining")).toBe(money(290));
    expect(document.querySelector('[data-category="Food"] .legend-percent')!.textContent).toBe(
      "100%",
    );
    expect(document.querySelector('[data-category="Housing"] .legend-percent')!.textContent).toBe(
      "0%",
    );
    expect(document.querySelector('[data-date="2026-10-03"]')!.className).not.toMatch(/spending-/);
    expect(document.activeElement).toBe(document.querySelector(".delete-expense-button"));
    deleteFirst();
    expect(savedUser().expenses).toEqual([past, euros, duplicate]);
    expect(text("report-total")).toBe(money(10));
    deleteFirst();
    expect(savedUser().expenses).toEqual([past, euros]);
    expect(savedUser().incomes).toEqual(user.incomes);
    expect(savedUser().monthlyBudget).toBe(310);
    expect(savedUser().customField).toBe("preserve-me");
    expect(document.activeElement).toBe(document.getElementById("report-total"));
    expect(text("report-list")).toContain("Încă nu ai cheltuieli");
    expect(text("report-total")).toBe(money(0));
    expect(
      document.querySelectorAll(
        ".calendar-day.spending-low, .calendar-day.spending-normal, .calendar-day.spending-high",
      ),
    ).toHaveLength(0);
    expect(
      [...document.querySelectorAll(".legend-percent")].every(
        (element) => element.textContent === "0%",
      ),
    ).toBe(true);
    const remainingUser = savedUser();
    expect(JSON.parse(localStorage.getItem("expenses_current_user")!).expenses).toEqual([
      past,
      euros,
    ]);
    start(remainingUser);
    expect(text("monthly-expenses")).toBe(money(0));
    document.getElementById("prev-month")!.click();
    expect(text("report-list")).toContain("Internet");
    expect(text("report-total")).toBe(money(50));
    field("settings-currency", "EUR");
    submit("currency-form");
    document.getElementById("next-month")!.click();
    expect(text("report-list")).toContain("Erasmus");
    expect(text("report-total")).toBe(money(20, "EUR"));
  });

  it("preserves expenses and displayed totals if deletion cannot be saved, then allows retrying", () => {
    start();
    const previousUsers = localStorage.getItem("expenses_users");
    const previousAccount = localStorage.getItem("expenses_current_user");
    const setItem = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "expenses_current_user")
        throw new DOMException("Storage full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const button = document.querySelector<HTMLButtonElement>(".delete-expense-button")!;
    button.click();
    expect(localStorage.getItem("expenses_users")).toBe(previousUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(previousAccount);
    expect(text("report-list")).toContain("Cantină");
    expect(text("monthly-expenses")).toBe(money(40));
    expect(text("expense-notification")).toContain("nu a putut fi ștearsă");
    expect(document.getElementById("expense-notification")).toHaveClass("error");
    storage.mockRestore();
    button.click();
    expect(savedUser().expenses).toEqual([legacyUser.expenses[1]]);
    expect(text("expense-notification")).toBe("Cheltuială ștearsă");
    expect(document.getElementById("expense-notification")).not.toHaveClass("error");
  });

  it("does not delete another account's expense from an outdated button", () => {
    start();
    const button = document.querySelector<HTMLButtonElement>(".delete-expense-button")!;
    const other = { ...legacyUser, email: "other@example.test" };
    const accounts = JSON.stringify([legacyUser, other]);
    localStorage.setItem("expenses_users", accounts);
    localStorage.setItem("expenses_current_user", JSON.stringify(other));
    button.click();
    expect(localStorage.getItem("expenses_users")).toBe(accounts);
    expect(JSON.parse(localStorage.getItem("expenses_current_user")!).expenses).toEqual(
      legacyUser.expenses,
    );
    expect(text("expense-notification")).toBe("");
  });

  it("deletes one visible income at a time without changing savings, expenses or other currency histories", () => {
    const duplicate = { source: "Bursă", amount: 100, date: "2026-10-03" };
    const past = { source: "Salariu", amount: 500, date: "2026-09-03" };
    const euros = { source: "Erasmus", amount: 200, date: "2026-10-03", currency: "EUR" };
    const user = {
      ...legacyUser,
      monthlyBudget: 310,
      incomes: [past, duplicate, euros, { ...duplicate }],
      savingsGoal: { name: "Laptop", target: 1000, saved: 150 },
      savingsContributions: [{ amount: 150, date: "2026-10-03" }],
    };
    start(user);
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-10-03"]')!.click();
    expect((document.getElementById("day-details") as HTMLDialogElement).open).toBe(true);
    expect(document.querySelectorAll(".delete-income-button")).toHaveLength(2);
    const stale = document.querySelector<HTMLButtonElement>(".delete-income-button")!;
    expect(stale).toHaveAccessibleName(`Șterge venitul: Bursă, ${money(100)}`);
    stale.click();
    expect(savedUser().incomes).toEqual([past, euros, duplicate]);
    expect(text("monthly-income")).toBe(money(-50));
    expect(text("monthly-balance")).toBe(money(-90));
    expect(text("budget-remaining")).toBe(money(270));
    expect(text("expense-notification")).toBe("Venit șters");
    expect(text("day-details-summary")).toContain(money(100));
    expect(text("day-details-summary")).toContain(money(-50));
    expect(document.activeElement).toBe(document.querySelector(".delete-income-button"));
    const beforeStale = localStorage.getItem("expenses_users");
    stale.click();
    expect(localStorage.getItem("expenses_users")).toBe(beforeStale);
    document.querySelector<HTMLButtonElement>(".delete-income-button")!.click();
    expect(savedUser().incomes).toEqual([past, euros]);
    expect(text("monthly-income")).toBe(money(-150));
    expect(text("monthly-balance")).toBe(money(-190));
    expect(document.activeElement).toBe(document.getElementById("income-amount"));
    expect(text("income-list")).toContain("Puși deoparte pentru economii");
    expect(document.querySelectorAll(".delete-income-button")).toHaveLength(0);
    expect(savedUser()).toMatchObject({
      expenses: user.expenses,
      monthlyBudget: user.monthlyBudget,
      savingsGoal: user.savingsGoal,
      savingsContributions: user.savingsContributions,
      customField: user.customField,
      password: user.password,
    });
    const remaining = savedUser();
    expect(JSON.parse(localStorage.getItem("expenses_current_user")!).incomes).toEqual([
      past,
      euros,
    ]);
    start(remaining);
    expect(text("monthly-income")).toBe(money(-150));
    document.getElementById("prev-month")!.click();
    expect(text("income-list")).toContain("Salariu");
    expect(text("monthly-income")).toBe(money(500));
    field("settings-currency", "EUR");
    submit("currency-form");
    document.getElementById("next-month")!.click();
    expect(text("income-list")).toContain("Erasmus");
    expect(text("monthly-income")).toBe(money(200, "EUR"));
  });

  it("restores the empty income list after deleting the last income and preserves unsaved input", () => {
    start({ ...legacyUser, incomes: [{ source: "Job", amount: 100, date: "2026-10-03" }] });
    field("income-amount", "250");
    document.querySelector<HTMLButtonElement>(".delete-income-button")!.click();
    expect(savedUser().incomes).toEqual([]);
    expect(text("income-list")).toContain("Adaugă bursa");
    expect(text("monthly-income")).toBe(money(0));
    expect(text("monthly-balance")).toBe(money(-40));
    expect(document.activeElement).toBe(document.getElementById("income-amount"));
    expect((document.getElementById("income-amount") as HTMLInputElement).value).toBe("250");
  });

  it("rolls back an income deletion on storage failure and allows retrying the same button", () => {
    start({ ...legacyUser, incomes: [{ source: "Bursă", amount: 200, date: "2026-10-03" }] });
    const previousUsers = localStorage.getItem("expenses_users");
    const previousAccount = localStorage.getItem("expenses_current_user");
    const setItem = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "expenses_current_user")
        throw new DOMException("Storage full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const button = document.querySelector<HTMLButtonElement>(".delete-income-button")!;
    button.click();
    expect(localStorage.getItem("expenses_users")).toBe(previousUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(previousAccount);
    expect(text("monthly-income")).toBe(money(200));
    expect(text("expense-notification")).toBe("Venitul nu a putut fi șters. Încearcă din nou.");
    expect(document.getElementById("expense-notification")).toHaveClass("error");
    expect(document.activeElement).toBe(button);
    storage.mockRestore();
    button.click();
    expect(savedUser().incomes).toEqual([]);
    expect(text("monthly-income")).toBe(money(0));
    expect(text("expense-notification")).toBe("Venit șters");
    expect(document.getElementById("expense-notification")).not.toHaveClass("error");
  });

  it("ignores income deletion buttons after a record changes or another account becomes current", () => {
    const user = { ...legacyUser, incomes: [{ source: "Job", amount: 100, date: "2026-10-03" }] };
    start(user);
    const button = document.querySelector<HTMLButtonElement>(".delete-income-button")!;
    const updated = { ...user, incomes: [{ ...user.incomes[0], amount: 125 }] };
    localStorage.setItem("expenses_users", JSON.stringify([updated]));
    localStorage.setItem("expenses_current_user", JSON.stringify(updated));
    const before = localStorage.getItem("expenses_users");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    button.click();
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    writes.mockRestore();
    const other = { ...user, email: "other@example.test" };
    const accounts = JSON.stringify([user, other]);
    localStorage.setItem("expenses_users", accounts);
    localStorage.setItem("expenses_current_user", JSON.stringify(other));
    const otherWrites = vi.spyOn(Storage.prototype, "setItem");
    button.click();
    expect(otherWrites).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe(accounts);
    expect(JSON.parse(localStorage.getItem("expenses_current_user")!)).toEqual(other);
  });

  it("chooses separate expense and income dates and saves the chosen dates", () => {
    start({ ...legacyUser, expenses: [] });
    const dialog = mockDialog();
    document.getElementById("expense-date-button")!.click();
    expect(dialog.open).toBe(true);
    expect(text("date-picker-title")).toBe("Data cheltuielii");
    expect(pickerDay("2026-10-03")).toHaveAttribute("aria-pressed", "true");
    document.getElementById("date-picker-prev")!.click();
    pickerDay("2026-09-30").click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("expense-date-button"));
    expect(text("expense-date-button")).toContain("30 septembrie 2026");
    field("description", "Cantină");
    field("amount", "20");
    submit("expense-form");
    expect(savedUser().expenses[0].date).toBe("2026-09-30");
    expect(text("expense-date-button")).toContain("3 octombrie 2026");
    document.getElementById("income-date-button")!.click();
    expect(text("date-picker-title")).toBe("Data venitului");
    pickerDay("2026-10-12").click();
    field("income-amount", "800");
    submit("income-form");
    expect(savedUser().incomes[0].date).toBe("2026-10-12");
    expect(text("income-date-button")).toContain("3 octombrie 2026");
    document.getElementById("next-month")!.click();
    expect(text("expense-date-button")).toContain("3 octombrie 2026");
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-11-07"]')!.click();
    expect(text("expense-date-button")).toContain("3 octombrie 2026");
    expect(document.getElementById("day-add-expense")).toBeDisabled();
  });

  it("navigates leap days with the keyboard and cancels without changing the date", () => {
    start();
    const dialog = mockDialog();
    field("expense-date", "2024-01-31");
    document.getElementById("expense-date-button")!.click();
    pickerDay("2024-01-31").dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(pickerDay("2024-02-29"));
    expect(document.querySelectorAll(".date-picker-day")).toHaveLength(29);
    pickerDay("2024-02-29").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(pickerDay("2024-03-01"));
    document.getElementById("date-picker-cancel")!.click();
    expect(dialog.open).toBe(false);
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2024-01-31");
    expect(document.getElementById("expense-date-button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    document.getElementById("expense-date-button")!.click();
    document.getElementById("date-picker-today")!.click();
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-03");
    expect(text("expense-date-button")).toContain("3 octombrie 2026");
  });

  it("disables future expense dates in the picker and clamps keyboard navigation to today's local date", () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59));
    start();
    mockDialog();
    const before = localStorage.getItem("expenses_users");
    document.getElementById("expense-date-button")!.click();
    expect(pickerDay("2026-10-05")).not.toBeDisabled();
    expect(pickerDay("2026-10-04")).not.toBeDisabled();
    expect(pickerDay("2026-10-06")).toBeDisabled();
    expect(pickerDay("2026-10-15")).toBeDisabled();
    expect(document.getElementById("date-picker-next")).toBeDisabled();
    pickerDay("2026-10-15").click();
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-05");
    for (const key of ["ArrowRight", "ArrowDown", "End", "PageDown"]) {
      pickerDay("2026-10-05").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(document.activeElement).toBe(pickerDay("2026-10-05"));
    }
    expect(localStorage.getItem("expenses_users")).toBe(before);
    document.getElementById("date-picker-prev")!.click();
    expect(document.getElementById("date-picker-next")).not.toBeDisabled();
    document.getElementById("date-picker-next")!.click();
    expect(document.getElementById("date-picker-next")).toBeDisabled();
    vi.setSystemTime(new Date(2026, 9, 6, 0, 1));
    document.getElementById("date-picker-cancel")!.click();
    document.getElementById("expense-date-button")!.click();
    expect(pickerDay("2026-10-06")).not.toBeDisabled();
    expect(pickerDay("2026-10-07")).toBeDisabled();
    document.getElementById("date-picker-today")!.click();
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-06");
  });

  it("rejects manually supplied future or impossible expense dates without saving and accepts past and present dates", () => {
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    start({ ...legacyUser, expenses: [] });
    const before = localStorage.getItem("expenses_users");
    const beforeCurrent = localStorage.getItem("expenses_current_user");
    field("description", "Cafea");
    field("amount", "25");
    for (const date of ["2026-10-15", "2026-11-01", "2026-02-30", ""]) {
      field("expense-date", date);
      submit("expense-form");
      expect(localStorage.getItem("expenses_users")).toBe(before);
      expect(localStorage.getItem("expenses_current_user")).toBe(beforeCurrent);
      expect(text("monthly-expenses")).toBe(money(0));
      expect(document.activeElement).toBe(document.getElementById("expense-date-button"));
      expect(document.getElementById("expense-date-button")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect((document.getElementById("description") as HTMLInputElement).value).toBe("Cafea");
    }
    mockDialog();
    document.getElementById("expense-date-button")!.click();
    pickerDay("2026-10-04").click();
    expect(document.getElementById("expense-date-button")).not.toHaveAttribute("aria-invalid");
    submit("expense-form");
    expect(savedUser().expenses[0]).toMatchObject({ date: "2026-10-04", amount: 25 });
    field("description", "Carte");
    field("amount", "10");
    field("expense-date", "2026-10-05");
    submit("expense-form");
    expect(savedUser().expenses[1]).toMatchObject({ date: "2026-10-05", amount: 10 });
    expect(text("monthly-expenses")).toBe(money(35));
  });

  it("preserves old future records on navigation and blocks creating expenses from future day details", () => {
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const future = {
      description: "Legacy entry",
      amount: 30,
      category: "Food",
      date: "2026-10-15",
    };
    start({ ...legacyUser, expenses: [future] });
    const before = localStorage.getItem("expenses_users");
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-10-15"]')!.click();
    expect(text("day-details-list")).toContain("Legacy entry");
    expect(document.getElementById("day-add-expense")).toBeDisabled();
    expect(document.getElementById("day-expense-date-note")).not.toHaveAttribute("hidden");
    expect(text("day-expense-date-note")).toContain("nu poate avea o dată viitoare");
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-05");
    document.getElementById("day-add-expense")!.click();
    expect(document.getElementById("day-details")).toHaveAttribute("open");
    document.querySelector<HTMLButtonElement>('[data-close-dialog="day-details"]')!.click();
    document.getElementById("next-month")!.click();
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-05");
    document.getElementById("prev-month")!.click();
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-10-04"]')!.click();
    expect(document.getElementById("day-add-expense")).not.toBeDisabled();
    expect(document.getElementById("day-expense-date-note")).toHaveAttribute("hidden");
    document.getElementById("day-add-expense")!.click();
    expect(document.activeElement).toBe(document.getElementById("description"));
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-04");
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it("blocks future dates in expense corrections, permits correcting an old future date and leaves income dates independent", () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59));
    start({ ...legacyUser, incomes: [{ source: "Bursă", amount: 100, date: "2026-10-01" }] });
    const before = localStorage.getItem("expenses_users");
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    expect(document.getElementById("edit-date")).toHaveAttribute("max", "2026-10-05");
    field("edit-date", "2026-10-06");
    field("edit-amount", "55");
    submit("transaction-edit-form");
    expect(text("edit-date-error")).toContain("nu poate avea o dată viitoare");
    expect(document.activeElement).toBe(document.getElementById("edit-date"));
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.getElementById("transaction-editor")).toHaveAttribute("open");
    vi.setSystemTime(new Date(2026, 9, 6, 0, 1));
    submit("transaction-edit-form");
    expect(savedUser().expenses[0]).toMatchObject({ date: "2026-10-06", amount: 55 });
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="incomes"]')!
      .click();
    expect(document.getElementById("edit-date")).not.toHaveAttribute("max");
    field("edit-date", "2026-10-15");
    submit("transaction-edit-form");
    expect(savedUser().incomes[0].date).toBe("2026-10-15");
    const withFuture = {
      ...legacyUser,
      expenses: [{ ...legacyUser.expenses[0], date: "2026-10-15" }],
    };
    start(withFuture);
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    submit("transaction-edit-form");
    expect(savedUser().expenses).toEqual(withFuture.expenses);
    expect(text("edit-date-error")).toContain("nu poate avea o dată viitoare");
    field("edit-date", "2026-10-05");
    submit("transaction-edit-form");
    expect(savedUser().expenses[0].date).toBe("2026-10-05");
  });

  it("opens the native photo chooser from the styled Romanian button", () => {
    start();
    const input = document.getElementById("profile-photo-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    document.getElementById("choose-profile-photo")!.click();
    expect(click).toHaveBeenCalledOnce();
    expect(input.hidden).toBe(true);
    expect(text("choose-profile-photo")).toBe("Alege poza");
  });

  it("detects campus categories and keeps chart percentages consistent with actual amounts", () => {
    start({ ...legacyUser, expenses: [] });
    for (const description of ["Xerox cursuri", "Medicamente", "Cantină", "Abonament autobuz"]) {
      field("description", description);
      field("amount", "25");
      submit("expense-form");
    }
    expect(savedUser().expenses.map((expense: { category: string }) => expense.category)).toEqual([
      "Education",
      "Health",
      "Food",
      "Transport",
    ]);
    for (const category of ["Education", "Health", "Food", "Transport"]) {
      expect(
        document.querySelector(`[data-category="${category}"] .legend-percent`)!.textContent,
      ).toBe("25%");
    }
    expect(text("report-total")).toBe(money(100));
    expect(text("category-totals")).toContain(money(25));
  });

  it("automatically puts champagne and other drinks in Food while respecting manual categories", () => {
    start({ ...legacyUser, expenses: [] });
    for (const description of [
      "sampanie",
      "ȘAMPANIE",
      "Șampania pentru petrecere",
      "O sticlă de champagne",
      "Bere",
      "Vin roșu",
      "Apă minerală",
      "Suc de portocale",
    ]) {
      field("description", description);
      field("amount", "10");
      submit("expense-form");
      expect(savedUser().expenses.at(-1).category).toBe("Food");
    }
    expect(document.querySelector('[data-category="Food"] .legend-percent')!.textContent).toBe(
      "100%",
    );
    field("description", "Șampon pentru păr");
    field("amount", "10");
    submit("expense-form");
    expect(savedUser().expenses.at(-1).category).toBe("Other");
    field("description", "Șampanie");
    field("amount", "10");
    field("category", "Entertainment");
    submit("expense-form");
    expect(savedUser().expenses.at(-1).category).toBe("Entertainment");
  });

  it("deducts a contribution from displayed income while preserving income entries and spending", () => {
    const incomes = [{ source: "Bursă", amount: 2000, currency: "RON", date: "2026-10-01" }];
    start({ ...legacyUser, incomes });
    field("savings-name", "Laptop pentru facultate");
    field("savings-target", "1000");
    submit("savings-form");
    field("savings-saved", "1200");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal).toEqual({
      name: "Laptop pentru facultate",
      target: 1000,
      saved: 1200,
    });
    expect(savedUser().incomes).toEqual(incomes);
    expect(savedUser().savingsContributions).toEqual([
      { amount: 1200, currency: "RON", date: "2026-10-03" },
    ]);
    start(savedUser());
    expect(text("savings-title")).toBe("Laptop pentru facultate");
    expect(document.getElementById("savings-progress")).toHaveAttribute("aria-valuenow", "100");
    expect(text("monthly-income")).toBe(money(800));
    expect(text("monthly-balance")).toBe(money(760));
    expect(text("income-list")).toContain(`−${money(1200)}`);
    expect(text("monthly-expenses")).toBe(money(40));
  });

  it("deducts successive contributions exactly once after reloads, goal edits and navigation", () => {
    const incomes = [{ source: "Bursă", amount: 1000, date: "2026-10-01" }];
    start({ ...legacyUser, incomes, savingsGoal: { name: "Laptop", target: 2000, saved: 100 } });
    expect(text("monthly-income")).toBe(money(1000));
    for (const value of ["200", "50.10"]) {
      field("savings-saved", value);
      submit("savings-contribution-form");
    }
    expect(savedUser().savingsGoal.saved).toBe(350.1);
    expect(savedUser().savingsContributions).toHaveLength(2);
    expect(text("monthly-income")).toBe(money(749.9));
    expect(text("monthly-balance")).toBe(money(709.9));
    submit("savings-contribution-form");
    field("savings-target", "3000");
    submit("savings-form");
    expect(savedUser().savingsContributions).toHaveLength(2);
    expect(text("monthly-income")).toBe(money(749.9));
    const user = savedUser();
    start(user);
    const stored = localStorage.getItem("expenses_users");
    document.getElementById("prev-month")!.click();
    document.getElementById("next-month")!.click();
    expect(text("monthly-income")).toBe(money(749.9));
    expect(text("monthly-balance")).toBe(money(709.9));
    expect(localStorage.getItem("expenses_users")).toBe(stored);
    expect(savedUser().incomes).toEqual(incomes);
  });

  it("dates savings when added rather than using the month shown in the calendar", () => {
    const incomes = [
      { source: "Bursă", amount: 500, date: "2026-09-01" },
      { source: "Bursă", amount: 1000, date: "2026-10-01" },
      { source: "Bursă", amount: 600, date: "2026-11-01" },
    ];
    start({ ...legacyUser, incomes, savingsGoal: { name: "Laptop", target: 2000, saved: 200 } });
    document.getElementById("prev-month")!.click();
    field("savings-saved", "100");
    submit("savings-contribution-form");
    expect(text("monthly-income")).toBe(money(500));
    expect(savedUser().savingsContributions[0].date).toBe("2026-10-03");
    document.getElementById("next-month")!.click();
    expect(text("monthly-income")).toBe(money(900));
    expect(text("monthly-balance")).toBe(money(860));
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(savedUser().savingsContributions[1].date).toBe("2026-11-03");
    expect(text("monthly-income")).toBe(money(900));
    document.getElementById("next-month")!.click();
    expect(text("monthly-income")).toBe(money(550));
    expect(savedUser().savingsGoal.saved).toBe(350);
  });

  it("allows a negative remaining balance without clamping savings deductions", () => {
    start({ ...legacyUser, savingsGoal: { name: "Laptop", target: 1000, saved: 0 } });
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(text("monthly-income")).toBe(money(-50));
    expect(text("monthly-balance")).toBe(money(-90));
    expect(savedUser().savingsGoal.saved).toBe(50);
  });

  it("emits decorative actions only for successful saves and for crossing a savings target", () => {
    start({ ...legacyUser, savingsGoal: { name: "Laptop", target: 100, saved: 0 } });
    const events: Array<{ kind: string; target: string }> = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        ["savings-contribution", "savings-reached", "profile-saved", "expense-added"].includes(
          detail.kind,
        )
      )
        events.push(detail);
    };
    document.addEventListener("hopper:ui", listener);
    try {
      for (const amount of ["25", "75", "5"]) {
        field("savings-saved", amount);
        submit("savings-contribution-form");
      }
      expect(events).toEqual([
        { kind: "savings-contribution", target: "savings-progress" },
        { kind: "savings-reached", target: "savings-progress" },
        { kind: "savings-contribution", target: "savings-progress" },
      ]);
      submit("savings-contribution-form");
      field("savings-target", "50");
      submit("savings-form");
      start(savedUser());
      expect(events).toHaveLength(3);
      field("profile-name", "Ana actualizată");
      submit("profile-form");
      expect(events.at(-1)).toEqual({ kind: "profile-saved", target: "header-profile-button" });
      field("description", "Cantină");
      field("amount", "10");
      submit("expense-form");
      expect(events.at(-1)).toEqual({ kind: "expense-added", target: "expense-notification" });
      const count = events.length;
      field("savings-saved", "10");
      const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage");
      });
      submit("savings-contribution-form");
      expect(events).toHaveLength(count);
      storage.mockRestore();
    } finally {
      document.removeEventListener("hopper:ui", listener);
    }
  });

  it("adds successive savings contributions to a legacy goal and preserves them when editing or reloading", () => {
    start({
      ...legacyUser,
      savingsGoal: { name: "Laptop", target: 1000, saved: 100, note: "preserve" },
    });
    expect((document.getElementById("savings-saved") as HTMLInputElement).value).toBe("");
    field("savings-saved", "25.10");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal.saved).toBe(125.1);
    expect((document.getElementById("savings-saved") as HTMLInputElement).value).toBe("");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal.saved).toBe(125.1);
    field("savings-saved", "0.20");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal.saved).toBe(125.3);
    expect(text("savings-progress-text")).toContain(`Ai strâns ${money(125.3)} din ${money(1000)}`);
    for (const invalid of ["-5", "0", "0.001", ""]) {
      field("savings-saved", invalid);
      submit("savings-contribution-form");
      expect(savedUser().savingsGoal.saved).toBe(125.3);
    }
    field("savings-target", "2000");
    field("savings-name", "Laptop nou");
    submit("savings-form");
    const user = savedUser();
    expect(user.savingsGoal).toEqual({
      name: "Laptop nou",
      target: 2000,
      saved: 125.3,
      note: "preserve",
    });
    expect(user.expenses).toEqual(legacyUser.expenses);
    expect(user.customField).toBe("preserve-me");
    start(user);
    expect(text("savings-progress-text")).toContain(money(125.3));
    expect((document.getElementById("savings-saved") as HTMLInputElement).value).toBe("");
  });

  it("requires a goal before contributing and retains the amount if storage fails", () => {
    start();
    expect(document.getElementById("savings-saved")).toBeDisabled();
    field("savings-saved", "50");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal).toBeUndefined();
    expect(text("savings-status")).toContain("mai întâi");
    field("savings-name", "Laptop");
    field("savings-target", "1000");
    submit("savings-form");
    expect(document.getElementById("savings-saved")).not.toBeDisabled();
    const before = localStorage.getItem("expenses_users");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage");
    });
    submit("savings-contribution-form");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect((document.getElementById("savings-saved") as HTMLInputElement).value).toBe("50");
    expect(text("savings-status")).toContain("nu a putut fi salvată");
  });

  it("validates sign-in fields then delegates credentials without local password checks", () => {
    start();
    document.getElementById("logout-button")!.click();
    submit("login-form");
    expect(text("login-status")).toContain("Completează emailul și parola");
    field("login-email", "invalid");
    field("login-password", "wrong");
    submit("login-form");
    expect(text("login-status")).toContain("email validă");
    field("login-email", "new@example.test");
    field("login-password", " a password with spaces ");
    submit("login-form");
    const auth = (
      window as unknown as { HopperAuth: ReturnType<typeof installAuthenticatedSession> }
    ).HopperAuth;
    expect(auth.signIn).toHaveBeenCalledWith({
      email: "new@example.test",
      password: " a password with spaces ",
    });
    expect(localStorage.getItem("expenses_current_user")).toBeNull();
    expect(savedUser()).toEqual(legacyUser);
  });

  it("starts with empty balances and rejects nonpositive expenses", () => {
    start({ ...legacyUser, expenses: [] });
    expect(text("monthly-expenses")).toBe(money(0));
    expect(text("budget-remaining")).toBe("Nesetat");
    expect(
      [...document.querySelectorAll(".legend-percent")].every(
        (element) => element.textContent === "0%",
      ),
    ).toBe(true);
    field("description", "Invalid amount");
    field("amount", "-20");
    submit("expense-form");
    expect(savedUser().expenses).toEqual([]);
    expect(text("expense-notification")).toBe("");
  });

  it("colors daily totals at budget boundaries and keeps future empty days neutral", () => {
    start({
      ...legacyUser,
      monthlyBudget: 3100,
      expenses: [
        { description: "Food", category: "Food", amount: 50, date: "2026-10-01" },
        { description: "Food", category: "Food", amount: 50.01, date: "2026-10-02" },
        { description: "Books", category: "Education", amount: 70, date: "2026-10-03" },
        { description: "Lunch", category: "Food", amount: 30, date: "2026-10-03" },
        { description: "Rent", category: "Housing", amount: 100.01, date: "2026-10-04" },
      ],
    });
    const day = (date: string) => document.querySelector(`[data-date="${date}"]`)!;
    expect(day("2026-10-01")).toHaveClass("spending-low");
    expect(day("2026-10-02")).toHaveClass("spending-normal");
    expect(day("2026-10-03")).toHaveClass("spending-normal", "today", "selected");
    expect(day("2026-10-03")).toHaveAttribute("aria-current", "date");
    expect(day("2026-10-03")).toHaveAttribute("aria-pressed", "true");
    expect(day("2026-10-03").getAttribute("aria-label")).toContain(money(100));
    expect(day("2026-10-04")).toHaveClass("spending-high");
    expect(day("2026-10-05").className).not.toMatch(/spending-/);
    day("2026-10-04").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(day("2026-10-04")).toHaveClass("spending-high", "selected");
    expect(day("2026-10-04").getAttribute("aria-label")).toContain(money(100.01));
    expect(day("2026-10-04").getAttribute("aria-label")).toContain("Cheltuieli ridicate");
  });

  it("recolors the calendar immediately after adding expenses and changing the budget", () => {
    start({ ...legacyUser, monthlyBudget: 3100, expenses: [] });
    const today = () => document.querySelector('[data-date="2026-10-03"]')!;
    expect(today().className).not.toMatch(/spending-/);
    for (const [amount, level] of [
      ["40", "low"],
      ["35", "normal"],
      ["30", "high"],
    ]) {
      field("description", "Cantină");
      field("amount", amount!);
      submit("expense-form");
      expect(today()).toHaveClass(`spending-${level}`, "today", "selected");
    }
    field("monthly-budget", "6200");
    submit("budget-form");
    expect(today()).toHaveClass("spending-normal");
    field("monthly-budget", "12400");
    submit("budget-form");
    expect(today()).toHaveClass("spending-low");
    start(savedUser());
    expect(today()).toHaveClass("spending-low");
    expect(today().getAttribute("aria-label")).toContain(money(105));
  });

  it("keeps past, current and future days neutral unless they have dated expenses in the active currency", () => {
    start({
      ...legacyUser,
      expenses: [
        { description: "Undated", category: "Food", amount: 20 },
        {
          description: "Other currency",
          category: "Food",
          amount: 20,
          currency: "EUR",
          date: "2026-10-01",
        },
        { description: "Invalid", category: "Food", amount: 0, date: "2026-10-02" },
        { description: "Future expense", category: "Food", amount: 10, date: "2026-10-04" },
      ],
    });
    for (const date of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"]) {
      const day = document.querySelector<HTMLButtonElement>(`.calendar-day[data-date="${date}"]`)!;
      expect(day.className).not.toMatch(/spending-/);
      expect(day.getAttribute("aria-label")).toContain("Fără cheltuieli");
      day.click();
      expect(document.querySelector(`.calendar-day[data-date="${date}"]`)!.className).not.toMatch(
        /spending-/,
      );
    }
    expect(document.querySelector('[data-date="2026-10-04"]')).toHaveClass("spending-low");
    expect(document.querySelector(".calendar-panel .student-note")).toBeNull();
    expect(document.querySelector(".calendar-spending-legend")!.textContent).toMatch(
      /Reduse\s+Moderate\s+Ridicate/,
    );
  });

  it("uses the default budget thresholds and recalculates them for each month", () => {
    start({
      ...legacyUser,
      expenses: [
        { description: "Food", category: "Food", amount: 25, date: "2026-10-01" },
        { description: "Food", category: "Food", amount: 25.01, date: "2026-10-02" },
        { description: "Food", category: "Food", amount: 50, date: "2026-10-03" },
        { description: "Food", category: "Food", amount: 50.01, date: "2026-10-04" },
      ],
    });
    for (const [date, level] of [
      ["01", "low"],
      ["02", "normal"],
      ["03", "normal"],
      ["04", "high"],
    ]) {
      expect(document.querySelector(`[data-date="2026-10-${date}"]`)).toHaveClass(
        `spending-${level}`,
      );
    }
    start({
      ...legacyUser,
      monthlyBudget: 3100,
      expenses: [
        { description: "Books", category: "Education", amount: 103.33, date: "2026-09-15" },
        { description: "Books", category: "Education", amount: 103.33, date: "2026-10-15" },
      ],
    });
    expect(document.querySelector('[data-date="2026-10-15"]')).toHaveClass("spending-high");
    document.getElementById("prev-month")!.click();
    expect(document.querySelector('[data-date="2026-09-15"]')).toHaveClass("spending-normal");
    document.getElementById("next-month")!.click();
    expect(document.querySelector('[data-date="2026-10-15"]')).toHaveClass("spending-high");
    expect(document.querySelector('[data-date="2026-10-01"]')!.className).not.toMatch(/spending-/);
  });

  it("chooses study years in the styled picker and saves or clears the selection", () => {
    start();
    const dialog = mockDialog("study-year-picker");
    const button = document.getElementById("study-year-button")!;
    const select = document.getElementById("profile-study-year") as HTMLSelectElement;
    expect(select.hidden).toBe(true);
    for (const [value, label] of [
      ["3", "Anul III"],
      ["master", "Master"],
      ["doctorat", "Doctorat"],
      ["", "Alege anul"],
    ]) {
      button.click();
      expect(dialog.open).toBe(true);
      expect(document.querySelectorAll(".study-year-option")).toHaveLength(9);
      document
        .querySelector<HTMLButtonElement>(`.study-year-option[data-value="${value}"]`)!
        .click();
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(button);
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(select.value).toBe(value);
      expect(text("study-year-value")).toBe(label);
      submit("profile-form");
      expect(savedUser().studyYear).toBe(value);
      expect(savedUser().expenses).toEqual(legacyUser.expenses);
    }
    start({ ...legacyUser, studyYear: "master" });
    expect(text("study-year-value")).toBe("Master");
  });

  it("moves focus through study years with the keyboard and preserves the selection on close", () => {
    start({ ...legacyUser, studyYear: "2" });
    const dialog = mockDialog("study-year-picker");
    document.getElementById("study-year-button")!.click();
    const selected = document.querySelector<HTMLButtonElement>(
      '.study-year-option[data-value="2"]',
    )!;
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toBe(selected);
    selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(
      document.querySelector('.study-year-option[data-value="3"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('.study-year-option[data-value="doctorat"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('.study-year-option[data-value=""]'),
    );
    document.getElementById("study-year-close")!.click();
    expect(dialog.open).toBe(false);
    expect(text("study-year-value")).toBe("Anul II");
    expect((document.getElementById("profile-study-year") as HTMLSelectElement).value).toBe("2");
    expect(savedUser().studyYear).toBe("2");
  });

  it("selects currencies in the retro picker and saves only after confirming settings", () => {
    start();
    const dialog = mockDialog("currency-picker");
    const trigger = document.getElementById("currency-button")!;
    trigger.click();
    expect(dialog.open).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelectorAll(".currency-option")).toHaveLength(5);
    expect(document.activeElement).toBe(
      document.querySelector('.currency-option[data-value="RON"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('.currency-option[data-value="EUR"]'),
    );
    (document.activeElement as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(text("currency-value")).toBe("EUR — Euro");
    expect(savedUser().currency).toBeUndefined();
    submit("currency-form");
    expect(savedUser().currency).toBe("EUR");
    expect(savedUser().expenses).toEqual(legacyUser.expenses);
    start(savedUser());
    expect(text("currency-value")).toBe("EUR — Euro");
  });

  it("preserves currency selection when closing the picker without choosing", () => {
    start({ ...legacyUser, currency: "EUR" });
    const dialog = mockDialog("currency-picker");
    document.getElementById("currency-button")!.click();
    expect(document.querySelector('.currency-option[data-value="EUR"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('.currency-option[data-value="CHF"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('.currency-option[data-value="RON"]'),
    );
    document.getElementById("currency-close")!.click();
    expect(dialog.open).toBe(false);
    expect(text("currency-value")).toBe("EUR — Euro");
    expect((document.getElementById("settings-currency") as HTMLSelectElement).value).toBe("EUR");
    expect(savedUser().currency).toBe("EUR");
  });

  it("adds savings in the selected currency without altering another currency's goal", () => {
    const ronGoal = { name: "Laptop", target: 1000, saved: 100 };
    const euroGoal = { name: "Erasmus", target: 500, saved: 20 };
    start({
      ...legacyUser,
      currency: "EUR",
      savingsGoal: ronGoal,
      savingsGoals: { EUR: euroGoal },
    });
    field("savings-saved", "5");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoals.EUR.saved).toBe(25);
    expect(savedUser().savingsGoal).toEqual(ronGoal);
    field("savings-saved", "10");
    field("settings-currency", "RON");
    submit("currency-form");
    expect((document.getElementById("savings-saved") as HTMLInputElement).value).toBe("");
    field("savings-saved", "30");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal.saved).toBe(130);
    expect(savedUser().savingsGoals.EUR.saved).toBe(25);
  });

  it("saves profile details and restores them without changing login credentials or transactions", () => {
    start();
    (document.querySelector('.view-tab[data-view="settings"]') as HTMLButtonElement).click();
    expect(document.querySelector('.page-view[data-view="settings"]')).toHaveClass("active");
    field("profile-name", "  Ana Popescu  ");
    field("profile-university", "Universitatea din București");
    field("profile-study-year", "2");
    submit("profile-form");
    expect(text("user-name")).toBe("Ana Popescu");
    expect(text("profile-display-name")).toBe("Ana Popescu");
    expect(text("profile-status")).toContain("salvat");
    expect(savedUser()).toMatchObject({
      name: "Ana Popescu",
      university: "Universitatea din București",
      studyYear: "2",
      email: legacyUser.email,
      password: legacyUser.password,
      expenses: legacyUser.expenses,
      customField: "preserve-me",
    });
    start(savedUser());
    expect((document.getElementById("profile-study-year") as HTMLSelectElement).value).toBe("2");
    expect(text("study-year-value")).toBe("Anul II");
    expect((document.getElementById("profile-name") as HTMLInputElement).value).toBe("Ana Popescu");
    field("profile-name", "   ");
    submit("profile-form");
    expect(savedUser().name).toBe("Ana Popescu");
  });

  it("keeps currency histories, budgets and savings separate and restores the selected currency", () => {
    const oldGoal = { name: "Laptop", target: 1000, saved: 100 };
    start({ ...legacyUser, monthlyBudget: 3100, savingsGoal: oldGoal });
    field("settings-currency", "EUR");
    submit("currency-form");
    expect(text("monthly-expenses")).toBe(money(0, "EUR"));
    expect(text("budget-remaining")).toBe("Nesetat");
    expect((document.getElementById("savings-name") as HTMLInputElement).value).toBe("");
    expect(document.querySelector('label[for="amount"]')!.textContent).toBe("Sumă (EUR)");
    field("description", "Cantină");
    field("amount", "20");
    submit("expense-form");
    field("income-amount", "100");
    submit("income-form");
    field("monthly-budget", "310");
    submit("budget-form");
    field("savings-name", "Erasmus");
    field("savings-target", "500");
    submit("savings-form");
    field("savings-saved", "25");
    submit("savings-contribution-form");
    expect(text("monthly-income")).toBe(money(75, "EUR"));
    expect(text("monthly-balance")).toBe(money(55, "EUR"));
    expect(text("budget-remaining")).toBe(money(290, "EUR"));
    expect(document.querySelector('[data-date="2026-10-03"]')).toHaveClass("spending-high");
    expect(
      document.querySelector('[data-date="2026-10-03"]')!.getAttribute("aria-label"),
    ).toContain(money(20, "EUR"));
    expect(savedUser().expenses.at(-1)).toMatchObject({ amount: 20, currency: "EUR" });
    expect(savedUser().expenses.slice(0, 2)).toEqual(legacyUser.expenses);
    expect(savedUser().savingsGoal).toEqual(oldGoal);
    start(savedUser());
    expect(text("monthly-expenses")).toBe(money(20, "EUR"));
    expect(text("report-list")).toContain(money(20, "EUR"));
    expect(text("savings-title")).toBe("Erasmus");
    expect(text("savings-progress-text")).toContain(money(25, "EUR"));
    field("settings-currency", "RON");
    submit("currency-form");
    expect(text("monthly-expenses")).toBe(money(40));
    expect(text("monthly-income")).toBe(money(0));
    expect(text("budget-remaining")).toBe(money(3060));
    expect(text("savings-title")).toBe("Laptop");
    expect(text("savings-progress-text")).toContain(money(100));
    expect(text("report-list")).not.toContain(money(20, "EUR"));
  });

  it("restores each account's preferences independently when switching accounts", () => {
    const euroUser = {
      ...legacyUser,
      currency: "EUR",
      email: "euro@example.test",
      name: "Alex",
      expenses: [],
    };
    start(euroUser);
    localStorage.setItem("expenses_users", JSON.stringify([euroUser, legacyUser]));
    document.getElementById("header-profile-button")!.click();
    document.getElementById("logout-button")!.click();
    field("login-email", legacyUser.email);
    field("login-password", legacyUser.password);
    submit("login-form");
    expect(text("user-name")).toBe("Ana");
    expect(text("active-currency-label")).toBe("Valută: RON");
    expect(text("monthly-expenses")).toBe(money(40));
    document.getElementById("header-profile-button")!.click();
    document.getElementById("logout-button")!.click();
    field("login-email", euroUser.email);
    field("login-password", euroUser.password);
    submit("login-form");
    expect(text("user-name")).toBe("Alex");
    expect(text("active-currency-label")).toBe("Valută: EUR");
    expect(text("monthly-expenses")).toBe(money(0, "EUR"));
  });

  it("saves an uploaded profile photo, restores both avatars and lets the user remove it", async () => {
    start();
    mockPhotoProcessing();
    choosePhoto(new File(["photo"], "profile.png", { type: "image/png" }));
    await vi.waitFor(() => expect(savedUser().profilePhoto).toBe(testPhoto));
    expect(text("profile-photo-status")).toContain("salvată");
    start(savedUser());
    for (const view of ["home", "report", "goals", "settings"]) {
      (document.querySelector(`.view-tab[data-view="${view}"]`) as HTMLButtonElement).click();
      const avatar = document.getElementById("header-profile-photo")!;
      expect(avatar).toHaveAttribute("src", testPhoto);
      expect(avatar).not.toHaveClass("hidden");
      expect(avatar.closest(".page-view")).toBeNull();
    }
    expect(document.getElementById("profile-photo")).toHaveAttribute("src", testPhoto);
    document.getElementById("header-profile-button")!.click();
    expect(document.querySelector('.page-view[data-view="settings"]')).toHaveClass("active");
    document.getElementById("remove-profile-photo")!.click();
    expect(savedUser().profilePhoto).toBeUndefined();
    expect(savedUser().expenses).toEqual(legacyUser.expenses);
    expect(document.getElementById("header-profile-photo")).toHaveClass("hidden");
    expect(text("header-profile-initial")).toBe("A");
  });

  it("keeps the old photo when file validation or storage fails", async () => {
    start({ ...legacyUser, profilePhoto: testPhoto });
    choosePhoto(new File(["text"], "not-an-image.txt", { type: "text/plain" }));
    expect(text("profile-photo-status")).toContain("maximum 5 MB");
    expect(savedUser().profilePhoto).toBe(testPhoto);
    choosePhoto(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
    );
    expect(text("profile-photo-status")).toContain("maximum 5 MB");
    expect(savedUser().profilePhoto).toBe(testPhoto);
    mockPhotoProcessing();
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue(
      "data:image/jpeg;base64,bmV3LXBob3Rv",
    );
    const previousUsers = localStorage.getItem("expenses_users");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "expenses_current_user")
        throw new DOMException("Storage full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    choosePhoto(new File(["photo"], "new-profile.jpg", { type: "image/jpeg" }));
    await vi.waitFor(() =>
      expect(text("profile-photo-status")).toContain("Poza anterioară a fost păstrată"),
    );
    expect(localStorage.getItem("expenses_users")).toBe(previousUsers);
    expect(document.getElementById("header-profile-photo")).toHaveAttribute("src", testPhoto);
  });

  it("edits one identical legacy expense without duplicating it or changing other fields", () => {
    const entry = {
      description: "Cafea",
      category: "Mâncare",
      amount: 10,
      date: "2026-10-01T10:00:00Z",
      note: "keep",
    };
    start({ ...legacyUser, expenses: [entry, { ...entry }], monthlyBudget: 100 });
    const before = localStorage.getItem("expenses_users");
    const button = document.querySelector<HTMLButtonElement>(
      '.edit-transaction-button[data-kind="expenses"][data-index="1"]',
    )!;
    button.click();
    expect(document.getElementById("transaction-editor")).toHaveAttribute("open");
    expect((document.getElementById("edit-description") as HTMLInputElement).value).toBe("Cafea");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    field("edit-amount", "20.50");
    field("edit-description", "Cafea și gustare");
    submit("transaction-edit-form");
    expect(savedUser().expenses).toEqual([
      entry,
      { ...entry, amount: 20.5, description: "Cafea și gustare" },
    ]);
    expect(savedUser().expenses[1].currency).toBeUndefined();
    expect(text("monthly-expenses")).toBe(money(30.5));
    expect(text("budget-remaining")).toBe(money(69.5));
    expect(document.getElementById("transaction-editor")).not.toHaveAttribute("open");
    expect(document.activeElement).toHaveAttribute("data-index", "1");
  });

  it("moves a corrected expense to another day and month and refreshes reports and calendar", () => {
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    start({
      ...legacyUser,
      expenses: [
        { description: "Cafea", amount: 40, category: "Food", date: "2026-10-01", currency: "RON" },
      ],
    });
    document.getElementById("prev-month")!.click();
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    field("edit-date", "2026-11-02");
    field("edit-category", "Education");
    submit("transaction-edit-form");
    expect(text("monthly-expenses")).toBe(money(0));
    expect(document.querySelector('.calendar-day[data-date="2026-10-01"]')!.className).not.toMatch(
      /spending-/,
    );
    expect(savedUser().expenses[0]).toMatchObject({
      date: "2026-11-02",
      category: "Education",
      currency: "RON",
    });
    document.getElementById("next-month")!.click();
    expect(text("monthly-expenses")).toBe(money(40));
    expect(text("report-list")).toContain("Facultate");
    expect(document.querySelector('.calendar-day[data-date="2026-11-02"]')).toHaveClass(
      "spending-normal",
    );
  });

  it("corrects income while retaining savings deductions, currency and metadata", () => {
    const income = {
      source: "Bursă",
      amount: 1000,
      date: "2026-10-01",
      currency: "EUR",
      note: "keep",
    };
    start({
      ...legacyUser,
      currency: "EUR",
      incomes: [income],
      savingsContributions: [{ amount: 100, date: "2026-10-03", currency: "EUR" }],
    });
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="incomes"]')!
      .click();
    expect(document.getElementById("edit-category")).toBeDisabled();
    field("edit-description", "Bursă corectată");
    field("edit-amount", "1200");
    submit("transaction-edit-form");
    expect(savedUser().incomes).toEqual([{ ...income, source: "Bursă corectată", amount: 1200 }]);
    expect(text("monthly-income")).toBe(money(1100, "EUR"));
    expect(savedUser().expenses).toEqual(legacyUser.expenses);
  });

  it("does not save invalid edits or cancelled edits", () => {
    start();
    const before = localStorage.getItem("expenses_users");
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    field("edit-description", "");
    field("edit-amount", "0.001");
    field("edit-date", "");
    submit("transaction-edit-form");
    expect(document.getElementById("edit-description-error")).not.toHaveAttribute("hidden");
    expect(document.getElementById("edit-amount-error")).not.toHaveAttribute("hidden");
    expect(document.getElementById("edit-date-error")).not.toHaveAttribute("hidden");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    document.querySelector<HTMLButtonElement>("#transaction-editor .secondary-button")!.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(document.activeElement).toHaveClass("edit-transaction-button");
  });

  it("rejects stale edits and preserves typed values when storage fails", () => {
    start();
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    const changed = savedUser();
    changed.expenses[0].amount = 99;
    localStorage.setItem("expenses_users", JSON.stringify([changed]));
    const before = localStorage.getItem("expenses_users");
    field("edit-amount", "15");
    submit("transaction-edit-form");
    expect(text("edit-status")).toContain("între timp");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    start();
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    field("edit-amount", "25");
    const previousUsers = localStorage.getItem("expenses_users");
    const previousCurrent = localStorage.getItem("expenses_current_user");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "expenses_current_user") throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    submit("transaction-edit-form");
    expect(localStorage.getItem("expenses_users")).toBe(previousUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(previousCurrent);
    expect((document.getElementById("edit-amount") as HTMLInputElement).value).toBe("25");
    expect(document.getElementById("transaction-editor")).toHaveAttribute("open");
    expect(text("edit-status")).toContain("nu au putut fi salvate");
  });

  it("cannot apply a pending transaction edit to another account", () => {
    start();
    document
      .querySelector<HTMLButtonElement>('.edit-transaction-button[data-kind="expenses"]')!
      .click();
    const other = { ...legacyUser, email: "other@example.test", name: "Bogdan" };
    localStorage.setItem("expenses_users", JSON.stringify([legacyUser, other]));
    localStorage.setItem("expenses_current_user", JSON.stringify(other));
    const before = localStorage.getItem("expenses_users");
    field("edit-amount", "5");
    submit("transaction-edit-form");
    expect(text("edit-status")).toContain("Contul s-a schimbat");
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it("opens daily details with currency-specific totals without changing financial data", () => {
    start({
      ...legacyUser,
      incomes: [
        { source: "Bursă", amount: 100, date: "2026-10-01" },
        { source: "EUR", amount: 999, date: "2026-10-01", currency: "EUR" },
      ],
      savingsContributions: [{ amount: 10, date: "2026-10-01", currency: "RON" }],
    });
    const before = localStorage.getItem("expenses_users");
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-10-01"]')!.click();
    expect(document.getElementById("day-details")).toHaveAttribute("open");
    expect(text("day-details-summary")).toContain(money(100));
    expect(text("day-details-summary")).toContain(money(50));
    expect(text("day-details-list")).toContain("Cantină");
    expect(text("day-details-list")).not.toContain("999");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    document.getElementById("day-add-expense")!.click();
    expect(document.activeElement).toBe(document.getElementById("description"));
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("2026-10-01");
    document.querySelector<HTMLButtonElement>('.calendar-day[data-date="2026-10-05"]')!.click();
    expect(text("day-details-list")).toContain("Nicio înregistrare");
    document.querySelector<HTMLButtonElement>('[data-close-dialog="day-details"]')!.click();
    expect(document.activeElement).toHaveAttribute("data-date", "2026-10-05");
    expect(localStorage.getItem("expenses_users")).toBe(before);
  });

  it("saves themes per account, restores them on login and preserves amounts", () => {
    start();
    const other = { ...legacyUser, email: "other@example.test", name: "Bogdan", theme: "peach" };
    localStorage.setItem("expenses_users", JSON.stringify([legacyUser, other]));
    document.querySelector<HTMLButtonElement>('[data-theme-choice="night"]')!.click();
    expect(document.documentElement.dataset["theme"]).toBe("night");
    expect(savedUser()).toEqual({
      ...legacyUser,
      theme: "night",
      achievementState: { earned: ["categorized"] },
    });
    document.getElementById("logout-button")!.click();
    expect(document.documentElement.dataset["theme"]).toBe("garden");
    field("login-email", other.email);
    field("login-password", other.password);
    submit("login-form");
    expect(document.documentElement.dataset["theme"]).toBe("peach");
    expect(JSON.parse(localStorage.getItem("expenses_users")!)[0].theme).toBe("night");
    start({ ...legacyUser, theme: "night" });
    expect(document.querySelector('[data-theme-choice="night"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    start({ ...legacyUser, theme: "unknown" });
    expect(document.documentElement.dataset["theme"]).toBe("garden");
  });

  it("keeps the displayed theme and stored account unchanged if saving a theme fails", () => {
    start({ ...legacyUser, theme: "peach" });
    const before = localStorage.getItem("expenses_users");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    document.querySelector<HTMLButtonElement>('[data-theme-choice="night"]')!.click();
    expect(document.documentElement.dataset["theme"]).toBe("peach");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect(text("theme-status")).toContain("nu a putut fi salvată");
  });

  it("keeps savings simple while preserving existing savings and illustration metadata", () => {
    const goal = { name: "Laptop", target: 100, saved: 20, note: "keep", illustration: "bike" };
    start({ ...legacyUser, savingsGoal: goal });
    expect(
      document.querySelector("#savings-illustration, #goal-scene, #goal-scene-caption"),
    ).toBeNull();
    expect(savedUser().savingsGoal).toEqual(goal);
    field("savings-name", "Vacanta");
    submit("savings-form");
    expect(savedUser().savingsGoal).toEqual({ ...goal, name: "Vacanta" });
    field("savings-saved", "80");
    submit("savings-contribution-form");
    expect(savedUser().savingsGoal).toEqual({ ...goal, name: "Vacanta", saved: 100 });
    expect(document.getElementById("savings-progress")).toHaveAttribute("aria-valuenow", "100");
    start(savedUser());
    expect(document.querySelector("#savings-illustration, #goal-scene")).toBeNull();
    expect(savedUser().savingsGoal.saved).toBe(100);
  });

  it("announces newly earned achievements through the separate bunny and lets users browse them", () => {
    start({ ...legacyUser, expenses: [], savingsGoal: { name: "Laptop", target: 100, saved: 0 } });
    expect(text("companion-message")).toContain("Prima economie");
    expect(text("companion-message")).not.toContain("Ai deblocat");
    expect(document.getElementById("companion-next")).toHaveAttribute("hidden");
    expect(document.querySelector("#mascot-message")).toBeNull();
    expect(document.querySelector(".student-intro")!.textContent).toBe(
      "Bursa, jobul \u0219i cheltuielile din facultate, \u00eentr-un singur loc.",
    );
    field("savings-saved", "10");
    submit("savings-contribution-form");
    expect(text("companion-message")).toContain("Ai deblocat");
    expect(text("companion-message")).toContain("Prima economie");
    expect(document.getElementById("achievement-companion")).toHaveAttribute(
      "data-celebrating",
      "true",
    );
    field("savings-saved", "90");
    submit("savings-contribution-form");
    expect(text("companion-message")).toContain("Primul obiectiv atins");
    expect(document.getElementById("companion-next")).not.toHaveAttribute("hidden");
    const before = localStorage.getItem("expenses_users");
    const messages = new Set<string>();
    const count = document.querySelectorAll(".achievement.earned").length;
    for (let i = 0; i < count; i++) {
      document.getElementById("companion-next")!.click();
      messages.add(text("companion-message")!);
    }
    expect([...messages].some((message) => message.includes("Prima economie"))).toBe(true);
    expect(text("companion-message")).toContain("Primul obiectiv atins");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    start(savedUser());
    expect(document.getElementById("achievement-companion")).toHaveAttribute(
      "data-celebrating",
      "false",
    );
    expect(text("companion-message")).toContain("Primul obiectiv atins");
  });

  it("derives achievement messages without budget coaching or data changes on navigation", () => {
    start({
      ...legacyUser,
      monthlyBudget: 20,
      savingsGoal: { name: "Laptop", target: 100, saved: 100 },
      incomes: [{ source: "Bursa", amount: 500, date: "2026-09-01" }],
    });
    const before = localStorage.getItem("expenses_users");
    expect(
      [...document.querySelectorAll<HTMLElement>(".achievement.earned")].map(
        (item) => item.dataset["badge"],
      ),
    ).toEqual(
      expect.arrayContaining([
        "first-saving",
        "goal-reached",
        "organized-month",
        "goal-quarter",
        "goal-half",
        "goal-three-quarters",
        "goal-ninety",
        "money-left",
        "categorized",
      ]),
    );
    expect(text("companion-message")).toContain("Primul obiectiv atins");
    expect(document.querySelector(".topbar")!.textContent).not.toContain("Pas cu pas");
    for (const view of ["report", "goals", "settings", "home"])
      document.querySelector<HTMLButtonElement>(`.view-tab[data-view="${view}"]`)!.click();
    expect(localStorage.getItem("expenses_users")).toBe(before);
    start({ ...legacyUser, email: "another@example.test", expenses: [] });
    expect(document.querySelectorAll(".achievement.earned")).toHaveLength(0);
    expect(text("companion-message")).not.toContain("Primul obiectiv atins");
    expect(text("companion-message")).not.toContain("Ai deblocat");
  });

  it("shows category shares through keyboard-usable buttons and refreshes after edits", () => {
    start({
      ...legacyUser,
      expenses: [
        { description: "Cafea", amount: 25, category: "Food", date: "2026-10-01" },
        { description: "Altele", amount: 75, category: "unknown", date: "2026-10-01" },
      ],
    });
    const before = localStorage.getItem("expenses_users");
    const food = document.querySelector<HTMLButtonElement>(
      '#category-totals [data-category="Food"]',
    )!;
    food.focus();
    food.click();
    expect(food).toHaveAttribute("aria-pressed", "true");
    expect(text("category-chart-detail")).toContain("25%");
    expect(text("category-chart-detail")).toContain(money(25));
    expect(localStorage.getItem("expenses_users")).toBe(before);
    document.querySelector<HTMLButtonElement>('.edit-transaction-button[data-index="0"]')!.click();
    field("edit-amount", "75");
    submit("transaction-edit-form");
    expect(text("category-chart-detail")).toContain("50%");
    expect(
      document.querySelector('#category-totals [data-category="Other"]')!.textContent,
    ).toContain(money(75));
  });

  it("does not save a pending photo to another account after logging out", async () => {
    start();
    const other = { ...legacyUser, name: "Bogdan", email: "other@example.test", expenses: [] };
    localStorage.setItem("expenses_users", JSON.stringify([legacyUser, other]));
    const images = mockPhotoProcessing(true);
    choosePhoto(new File(["photo"], "profile.png", { type: "image/png" }));
    await vi.waitFor(() => expect(images).toHaveLength(1));
    document.getElementById("logout-button")!.click();
    field("login-email", other.email);
    field("login-password", other.password);
    submit("login-form");
    images[0]!.onload!();
    await Promise.resolve();
    expect(
      JSON.parse(localStorage.getItem("expenses_users")!).every(
        (user: { profilePhoto?: string }) => !user.profilePhoto,
      ),
    ).toBe(true);
    expect(text("header-profile-initial")).toBe("B");
    expect(document.getElementById("header-profile-photo")).toHaveClass("hidden");
  });

  it("delegates registration without saving a plaintext password locally", () => {
    start();
    document.getElementById("logout-button")!.click();
    field("register-name", "Alex");
    field("register-email", "alex@example.test");
    field("register-password", "test-password");
    submit("register-form");
    const auth = (
      window as unknown as { HopperAuth: ReturnType<typeof installAuthenticatedSession> }
    ).HopperAuth;
    expect(auth.register).toHaveBeenCalledWith({
      name: "Alex",
      email: "alex@example.test",
      password: "test-password",
    });
    expect(JSON.parse(localStorage.getItem("expenses_users")!)).toEqual([legacyUser]);
  });

  it("keeps the existing profile photo until the positioned crop is confirmed", async () => {
    start({ ...legacyUser, profilePhoto: testPhoto });
    let resolve!: (photo: string) => void;
    const win = window as Window & { HopperProfileCrop?: (file: File) => Promise<string> };
    win.HopperProfileCrop = () =>
      new Promise((done) => {
        resolve = done;
      });
    try {
      choosePhoto(new File(["p"], "new.png", { type: "image/png" }));
      expect(savedUser().profilePhoto).toBe(testPhoto);
      resolve("data:image/jpeg;base64,bmV3");
      await vi.waitFor(() => expect(savedUser().profilePhoto).toBe("data:image/jpeg;base64,bmV3"));
      win.HopperProfileCrop = async () => {
        throw new DOMException("cancelled", "AbortError");
      };
      choosePhoto(new File(["p"], "other.png", { type: "image/png" }));
      await vi.waitFor(() => expect(text("profile-photo-status")).toContain("anulată"));
      expect(savedUser().profilePhoto).toBe("data:image/jpeg;base64,bmV3");
    } finally {
      delete win.HopperProfileCrop;
    }
  });

  it("chooses an expense category in the pastel picker and resets to automatic detection after saving", () => {
    start(legacyUser, true);
    const trigger = document.getElementById("expense-category-button")!;
    const dialog = document.getElementById("expense-category-picker") as HTMLDialogElement;
    const select = document.getElementById("category") as HTMLSelectElement;
    expect(select.hidden).toBe(true);
    expect(trigger.hidden).toBe(false);
    expect(document.getElementById("expense-category-label")).toHaveAttribute("for", trigger.id);
    field("description", "Abonament autobuz");
    field("amount", "25");
    const date = (document.getElementById("expense-date") as HTMLInputElement).value;
    const before = localStorage.getItem("expenses_users");
    trigger.click();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(
      document.querySelector('#expense-category-options [data-value="auto"]'),
    );
    document
      .querySelector<HTMLButtonElement>('#expense-category-options [data-value="Transport"]')!
      .click();
    expect(select.value).toBe("Transport");
    expect(text("expense-category-value")).toBe("Transport");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect((document.getElementById("description") as HTMLInputElement).value).toBe(
      "Abonament autobuz",
    );
    expect(document.activeElement).toBe(trigger);
    submit("expense-form");
    expect(savedUser().expenses.at(-1)).toMatchObject({ category: "Transport", amount: 25, date });
    expect(select.value).toBe("auto");
    expect(text("expense-category-value")).toBe("Detectează automat");
    field("description", "Cantină");
    field("amount", "10");
    submit("expense-form");
    expect(savedUser().expenses.at(-1).category).toBe("Food");
  });

  it("keeps category choices current, supports keyboard cancellation and closes on logout", () => {
    start(
      {
        ...legacyUser,
        customCategories: [{ id: "custom-hobby", label: "Hobby cu o denumire lungă de categorie" }],
        hiddenCategories: { Food: true },
      },
      true,
    );
    const trigger = document.getElementById("expense-category-button")!;
    const dialog = document.getElementById("expense-category-picker") as HTMLDialogElement;
    trigger.click();
    expect(document.querySelector('#expense-category-options [data-value="Food"]')).toBeNull();
    expect(
      document.querySelector('#expense-category-options [data-value="custom-hobby"]')!.textContent,
    ).toBe("Hobby cu o denumire lungă de categorie");
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('#expense-category-options [data-value="custom-hobby"]'),
    );
    document.getElementById("expense-category-close")!.click();
    expect(text("expense-category-value")).toBe("Detectează automat");
    trigger.click();
    document
      .querySelector<HTMLButtonElement>('#expense-category-options [data-value="Transport"]')!
      .click();
    document.querySelector<HTMLButtonElement>('[data-remove-category="Transport"]')!.click();
    expect(text("expense-category-value")).toBe("Detectează automat");
    field("custom-category-name", "Sport");
    submit("custom-category-form");
    trigger.click();
    expect(
      [...document.querySelectorAll("#expense-category-options button")].some(
        (button) => button.textContent === "Sport",
      ),
    ).toBe(true);
    expect(document.querySelector('#expense-category-options [data-value="Transport"]')).toBeNull();
    document.getElementById("logout-button")!.click();
    expect(dialog.open).toBe(false);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows category validation at the visible control when all categories are removed", () => {
    start(legacyUser, true);
    while (document.querySelector("[data-remove-category]"))
      document.querySelector<HTMLButtonElement>("[data-remove-category]")!.click();
    const before = localStorage.getItem("expenses_users");
    field("description", "Carte");
    field("amount", "5");
    submit("expense-form");
    const trigger = document.getElementById("expense-category-button")!;
    expect(text("category-error")).toContain("restabilește");
    expect(document.getElementById("category-error")!.previousElementSibling).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(trigger);
    expect(localStorage.getItem("expenses_users")).toBe(before);
    document.getElementById("expense-form")!.dispatchEvent(new Event("reset"));
    expect(trigger).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("category-error")!.hidden).toBe(true);
  });

  it("retains the original selector when modal dialogs are unavailable", () => {
    start();
    expect(document.getElementById("category")!.hidden).toBe(false);
    expect(document.getElementById("expense-category-button")!.hidden).toBe(true);
  });

  it("selects income sources through the retro picker and saves the original value only on submission", () => {
    start();
    const before = localStorage.getItem("expenses_users");
    const dialog = mockDialog("income-source-picker");
    const trigger = document.getElementById("income-source-button")!;
    field("income-amount", "80");
    const date = (document.getElementById("income-date") as HTMLInputElement).value;
    trigger.click();
    expect(dialog.open).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelectorAll("#income-source-options button")).toHaveLength(6);
    expect(document.activeElement).toBe(
      document.querySelector('#income-source-options [data-value="Bursă"]'),
    );
    document
      .querySelector<HTMLButtonElement>(
        '#income-source-options [data-value="Sprijin de la familie"]',
      )!
      .click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(text("income-source-value")).toBe("Sprijin de la familie");
    expect(localStorage.getItem("expenses_users")).toBe(before);
    expect((document.getElementById("income-amount") as HTMLInputElement).value).toBe("80");
    expect((document.getElementById("income-date") as HTMLInputElement).value).toBe(date);
    submit("income-form");
    expect(savedUser().incomes.at(-1)).toMatchObject({
      source: "Sprijin de la familie",
      amount: 80,
      date,
      currency: "RON",
    });
    expect(text("income-source-value")).toBe("Bursă");
    expect((document.getElementById("income-source") as HTMLSelectElement).value).toBe("Bursă");
  });

  it("supports keyboard navigation, cancels without changing income sources, and closes on logout", () => {
    start();
    const dialog = mockDialog("income-source-picker");
    const trigger = document.getElementById("income-source-button")!;
    trigger.click();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('#income-source-options [data-value="Sprijin de la familie"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('#income-source-options [data-value="Alte venituri"]'),
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(document.activeElement).toBe(
      document.querySelector('#income-source-options [data-value="Bursă"]'),
    );
    document.getElementById("income-source-close")!.click();
    expect(text("income-source-value")).toBe("Bursă");
    expect(savedUser().incomes).toBeUndefined();
    trigger.click();
    document.getElementById("logout-button")!.click();
    expect(dialog.open).toBe(false);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
