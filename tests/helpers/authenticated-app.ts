import { vi } from "vitest";

type Account = Record<string, unknown> & { email: string };
type Bridge = { openUser: (user: Account) => boolean; currentUser: () => Account | null };
const app = () => (window as unknown as { HopperApp: Bridge }).HopperApp;

// Financial tests begin after authentication; security flows use the real controller in auth.test.ts.
export function installAuthenticatedSession(getClient?: () => unknown) {
  const auth = {
    canOpen: vi.fn(() => true),
    canAccept: vi.fn(() => true),
    getClient: vi.fn(() => getClient?.()),
    resume: vi.fn(() => {
      const current = localStorage.getItem("expenses_current_user");
      if (current) app().openUser(JSON.parse(current) as Account);
      return Promise.resolve();
    }),
    signIn: vi.fn(({ email }: { email: string; password: string }) => {
      const users = JSON.parse(localStorage.getItem("expenses_users") || "[]") as Account[];
      const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
      if (user) app().openUser(user);
      return Promise.resolve();
    }),
    register: vi.fn((_input: { name: string; email: string; password: string }) =>
      Promise.resolve(),
    ),
  };
  vi.stubGlobal("HopperAuth", auth);
  return auth;
}
