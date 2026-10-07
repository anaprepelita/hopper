# AGENTS.md

## Project overview

Hopper is an Android/iOS student budget app using Capacitor. Its HTML/CSS/JavaScript interface lives in [mobile/app/](mobile/app/) and runs inside the installed native WebView. There is no public website, TanStack router, iframe shell or PWA install flow.

## Critical conventions

- Keep Android and iOS as the only app targets. Do not reintroduce a public website or browser financial app entry. The user-authorized `mobile:live:android` / `mobile:live:ios` workflow may use a temporary loopback/private LAN server exclusively for native development. Production configuration must keep local assets and no server URL.
- Preserve the financial UI and storage logic in [mobile/app/](mobile/app/). Native startup is gated by [mobile/bootstrap.ts](mobile/bootstrap.ts); only Capacitor loads the local financial scripts.
- Do not rewrite published git history or force push, rebase or squash published branches.
- Preserve the original local animal images in [mobile/app/animals/](mobile/app/animals/) and metadata in [mobile/assets/animals/](mobile/assets/animals/).
- Profile photos stay locally on each device for each account. Do not upload them or commit them.
- Use the WebView's localStorage as the financial persistence layer, mirrored on-device through `mobile/persistence.ts` and Capacitor Preferences. Restore the existing account keys before loading the financial scripts; preserve explicit logout and never overwrite valid copies with malformed data. Optional Supabase sync lives in `mobile/app/sync.js`; local accounts work without a backend. Upload only the explicit financial/profile allowlist, never local passwords or photos. Preserve local copies and detect competing remote changes.
- Preserve `expenses_users` and `expenses_current_user`, saved records and unrelated account fields. Remain compatible with older accounts.
- Treat amounts without currency as RON. A preferred currency change selects the entry/view currency; it must not convert or relabel existing amounts.
- Romanian is the default. Use the local catalogs for English, French and Russian; never translate stored names, descriptions or custom category labels in place.
- Build `mobile-dist/` from `mobile/app/`; do not edit generated resources directly. Use `npm run mobile:sync:android` / `mobile:sync:ios` after interface changes.
- Live Reload builds use ignored `.mobile-live/` directories. Stop with Ctrl+C or `mobile:live:stop` before packaged builds; `mobile:live:restore` recovers an interrupted session. Preserve original native configuration and concurrent source edits on restoration. Never ship the reload client or live server URL in store/APK packages.
- Preserve the app identifier and native storage origin after release. The current identifier is `ro.hopper.budget`; hostname `localhost`, Android scheme `https` and iOS scheme `capacitor` must stay stable without an explicit migration plan.
- Signing and store uploads require the user's explicit authorization. Packaging resources is not an APK/AAB/IPA build or device test.
- Android distribution commands are `android:apk`, `android:aab`, `android:release` and the testing-only `android:apk:debug`. Keep keystores/passwords out of source control and chat. Private signing configuration belongs in ignored `android/signing.properties` or environment variables; missing release signing must fail rather than export unsigned artifacts.
- Both Android formats use the tracked `android/version.properties`. Preserve the package identity and ensure directly distributed APKs use the same app-signing certificate as Google Play when cross-channel updates are intended; upload-key matching alone is insufficient.

## Key files

- [README.md](README.md) for product behavior and native setup.
- [capacitor.config.ts](capacitor.config.ts) for native configuration.
- [mobile/app/index.html](mobile/app/index.html) and [mobile/app/script.js](mobile/app/script.js) for the financial interface.
- [mobile/bootstrap.ts](mobile/bootstrap.ts) and [mobile/runtime.ts](mobile/runtime.ts) for native launch and lifecycle.
- [tests/student-budget.test.ts](tests/student-budget.test.ts) for existing data and financial behavior.
- [tests/mobile-app.test.ts](tests/mobile-app.test.ts) and [tests/native-bootstrap.test.ts](tests/native-bootstrap.test.ts) for native packaging/launch behavior.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The build includes local resource checks. Native SDK/device verification is additional; report when unavailable.

## Working style

- Prefer targeted changes that preserve the existing financial interface and local data model.
- Keep detailed product behavior in README and development conventions here.
- Use the existing Vitest setup for feature validation.
- Confirm local storage keys and the native install/storage origin remain intact before finishing.

## Daily change journal

- The user requested a daily record of additions and modifications. Maintain [CHANGELOG.md](CHANGELOG.md) with concise Romanian descriptions of actual features added, changed, fixed or removed while working on the project. Use the date in Europe/Bucharest, preserve earlier days and existing notes, and never include private values or user records.
- The GitHub automation appends exact staged file changes to the same day's section before committing. Keep human descriptions alongside these automatic entries; do not invent completed features or create entries for days without changes. Do not edit existing automatic update IDs or duplicate their file lists manually.
