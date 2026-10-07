import { Preferences } from "@capacitor/preferences";

export const ACCOUNT_BACKUP_KEY = "hopper_accounts_v1";
const USERS = "expenses_users";
const CURRENT = "expenses_current_user";
type Account = Record<string, unknown>;
type Snapshot = { version: 1; users: string | null; current: string | null };
type NativeStore = Pick<typeof Preferences, "get" | "set">;
export type Persistence = { schedule: () => void; flush: () => Promise<void> };
declare global {
  interface Window {
    HopperPersistence?: Persistence;
  }
}
export class HopperStorageError extends Error {
  constructor() {
    super(
      "Datele salvate nu au putut fi citite. Încearcă din nou; nu este nevoie să creezi alt cont.",
    );
    this.name = "HopperStorageError";
  }
}
function account(value: unknown): value is Account {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function records(raw: string | null): Account[] {
  const value: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(account)) throw new HopperStorageError();
  return value;
}
function session(raw: string | null): Account | null {
  const value: unknown = raw === null ? null : JSON.parse(raw);
  if (value !== null && !account(value)) throw new HopperStorageError();
  return value;
}
function identity(value: Account): string {
  return typeof value["email"] === "string" ? value["email"].trim().toLowerCase() : "";
}
function capture(storage: Storage): Snapshot {
  const snapshot: Snapshot = {
    version: 1,
    users: storage.getItem(USERS),
    current: storage.getItem(CURRENT),
  };
  records(snapshot.users);
  session(snapshot.current);
  return snapshot;
}
function decode(raw: string | null): Snapshot | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as Snapshot;
  if (
    !value ||
    value.version !== 1 ||
    !(value.users === null || typeof value.users === "string") ||
    !(value.current === null || typeof value.current === "string")
  )
    throw new HopperStorageError();
  records(value.users);
  session(value.current);
  return value;
}

// Reconcile before loading the financial scripts. Existing local records win over
// a possibly older mirror; restoring an absent session alone would undo logout.
export async function createAccountPersistence(
  native: NativeStore = Preferences,
  storage: Storage = localStorage,
  onFailure: (failed: boolean) => void = () => {},
): Promise<Persistence> {
  try {
    const backup = decode((await native.get({ key: ACCOUNT_BACKUP_KEY })).value);
    let local: Snapshot;
    try {
      local = capture(storage);
    } catch {
      // Never replace malformed records automatically or present an empty account.
      throw new HopperStorageError();
    }
    let users = records(local.users);
    const current = session(local.current);
    if (!users.length && backup && records(backup.users).length) {
      local = { ...backup, current: current ? local.current : backup.current };
      users = records(local.users);
    }
    const restored = session(local.current);
    if (
      restored &&
      identity(restored) &&
      !users.some((user) => identity(user) === identity(restored))
    ) {
      users.push(restored);
      local.users = JSON.stringify(users);
    }
    // A partial loss of the account list can leave a newer session than the mirror.
    if (current && !records(storage.getItem(USERS)).length && identity(current)) {
      const index = users.findIndex((user) => identity(user) === identity(current));
      if (index >= 0) users[index] = current;
      else users.push(current);
      local.users = JSON.stringify(users);
    }
    if (local.users !== storage.getItem(USERS)) {
      if (local.users === null) storage.removeItem(USERS);
      else storage.setItem(USERS, local.users);
    }
    if (local.current !== storage.getItem(CURRENT)) {
      if (local.current === null) storage.removeItem(CURRENT);
      else storage.setItem(CURRENT, local.current);
    }
    let queue: Promise<void> = Promise.resolve();
    let saved: string | undefined;
    let scheduled = false;
    const flush = (): Promise<void> => {
      let encoded: string;
      try {
        encoded = JSON.stringify(capture(storage));
      } catch {
        onFailure(true);
        return Promise.reject(new HopperStorageError());
      }
      queue = queue
        .catch(() => {})
        .then(async () => {
          if (saved === encoded) return;
          try {
            await native.set({ key: ACCOUNT_BACKUP_KEY, value: encoded });
            saved = encoded;
            onFailure(false);
          } catch (error) {
            onFailure(true);
            throw error;
          }
        });
      return queue;
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        void flush().catch(() => {});
      });
    };
    await flush();
    return { schedule, flush };
  } catch {
    throw new HopperStorageError();
  }
}

export async function initializeAccountPersistence(): Promise<void> {
  const banner = document.getElementById("storage-warning");
  const messages: Record<string, string> = {
    ro: "Copia de siguranță nu s-a actualizat. Datele sunt păstrate în aplicație. Încearcă din nou.",
    en: "The backup could not be updated. Your data is still in the app. Please retry.",
    fr: "La sauvegarde n’a pas été actualisée. Vos données restent dans l’application. Réessayez.",
    ru: "Не удалось обновить резервную копию. Данные сохранены в приложении. Повторите попытку.",
  };
  const update = (failed: boolean) => {
    if (!banner) return;
    banner.hidden = !failed;
    const text = banner.querySelector("p");
    if (text) text.textContent = messages[document.documentElement.lang] ?? messages["ro"]!;
  };
  window.HopperPersistence = await createAccountPersistence(Preferences, localStorage, update);
  document.getElementById("storage-retry")?.addEventListener("click", () => {
    void window.HopperPersistence?.flush().catch(() => {});
  });
  document.addEventListener("hopper:language", () => {
    if (banner && !banner.hidden) update(true);
  });
}
