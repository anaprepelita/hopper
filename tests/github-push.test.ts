import { describe, expect, it } from "vitest";
import {
  assertPublishablePath,
  assertSafeContent,
  debounce,
  fingerprint,
  quietPeriodMs,
} from "../scripts/github-policy.mjs";

describe("automatic GitHub publishing safeguards", () => {
  it("waits ten minutes after the last saved change and resets after another edit", () => {
    const first = debounce(null, "first", 1000);
    expect(debounce(first, "first", 1000 + quietPeriodMs - 1).ready).toBe(false);
    expect(debounce(first, "first", 1000 + quietPeriodMs).ready).toBe(true);
    const edited = debounce(first, "second", 1000 + quietPeriodMs);
    expect(edited.ready).toBe(false);
    expect(debounce(edited, "second", edited.changedAt + quietPeriodMs).ready).toBe(true);
  });

  it("notices content changes and deletion, regardless of filename order", () => {
    const before = [
      { path: "mobile/app/script.js", hash: "one" },
      { path: "README.md", hash: "two" },
    ];
    expect(fingerprint(before)).toBe(fingerprint([...before].reverse()));
    expect(fingerprint(before)).not.toBe(
      fingerprint([{ ...before[0]!, hash: "edited" }, before[1]!]),
    );
    expect(fingerprint(before)).not.toBe(fingerprint([{ ...before[0]!, hash: null }, before[1]!]));
  });

  it("rejects signing keys, SDK installs, private exports and unknown locations", () => {
    for (const path of [
      ".env.local",
      "android/local.properties",
      "android/signing.properties",
      "android/app/release.apk",
      "Android Pack/bin/studio64.exe",
      "mobile/app/profile-photo.png",
      "mobile/app/account-backup.json",
      "mobile-dist/index.html",
      "private/notes.md",
      "mobile/app/new-picture.jpg",
      "mobile/../private.txt",
      "scripts\\private.txt",
    ])
      expect(() => assertPublishablePath(path)).toThrow();
    for (const path of [
      ".env.example",
      ".env.reports.example",
      "supabase/.env.example",
      "android/signing.properties.example",
      "mobile/app/index.html",
      "scripts/github-push.mjs",
      "mobile/app/animals/bunny.png",
      "android/gradle/wrapper/gradle-wrapper.jar",
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    ])
      expect(() => assertPublishablePath(path)).not.toThrow();
  });

  it("blocks credentials and real exported accounts without printing their values", () => {
    const token = "ghp_" + "a".repeat(36);
    expect(() => assertSafeContent("mobile/app/config.js", Buffer.from(token))).toThrow(
      "Possible credential",
    );
    expect(() =>
      assertSafeContent(
        "mobile/app/users.json",
        Buffer.from(
          JSON.stringify([{ email: "test@example.com", password: "private", budget: 100 }]),
        ),
      ),
    ).toThrow("Possible exported account");
    expect(() =>
      assertSafeContent("mobile/app/translations.js", Buffer.from("const key = 'expenses_users';")),
    ).not.toThrow();
    expect(() =>
      assertSafeContent(".env.example", Buffer.from("RESEND_API_KEY=replace_on_server_only")),
    ).not.toThrow();
  });
});
