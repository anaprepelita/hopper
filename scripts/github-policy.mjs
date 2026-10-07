export const targetRemote = "student";
export const targetUrl = "https://github.com/anaprepelita/hopper.git";

const rootFiles = new Set([
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  ".env.example",
  ".env.reports.example",
  "AGENTS.md",
  "README.md",
  "CHANGELOG.md",
  "roadmap.md",
  "bun.lock",
  "bunfig.toml",
  "package.json",
  "package-lock.json",
  "eslint.config.js",
  "tsconfig.json",
  "vitest.config.ts",
  "capacitor.config.ts",
]);
const sourceExtension =
  /\.(?:html|css|js|mjs|mts|ts|tsx|py|ps1|md|json|sql|toml|xml|java|gradle|pro|properties|txt|swift|storyboard|xcprivacy|plist|bat|sh|xcconfig|pbxproj|xcworkspacedata)$/i;
const sensitivePath =
  /(?:^|\/)(?:\.env(?:\.[^/]*)?|local\.properties|signing\.properties|credentials(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|.*(?:profile[-_]?photos?|account[-_]?backup|report[-_]?evidence|financial[-_]?backup).*)(?:$|\/)|\.(?:keystore|jks|p12|pfx|pem|key|mobileprovision|apk|aab|ipa)$/i;
const examples = new Set([
  ".env.example",
  ".env.reports.example",
  "supabase/.env.example",
  "android/signing.properties.example",
]);
const secretPatterns = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /(?:sk_live_|sb_secret_|re_)[A-Za-z0-9_-]{24,}/,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/,
];

export function assertPublishablePath(path) {
  if (
    path.includes("\\") ||
    path.split("/").includes("..") ||
    (sensitivePath.test(path) && !examples.has(path))
  ) {
    throw new Error("Private or unexpected path: " + path);
  }
  if (rootFiles.has(path) || examples.has(path)) return;
  if (!/^(?:mobile|android|ios|scripts|supabase|tests)\//.test(path)) {
    throw new Error("Unreviewed directory or root file: " + path);
  }
  if (
    /(?:^|\/)(?:node_modules|build|\.gradle|\.mobile-live|\.github-local|artifacts|public|Pods|DerivedData)(?:\/|$)/.test(
      path,
    )
  ) {
    throw new Error("Generated or private directory: " + path);
  }
  if (sourceExtension.test(path) || /(?:^|\/)(?:\.gitignore|gradlew)$/.test(path)) return;
  if (
    /^mobile\/app\/animals\/(?:bunny|cat|chick|duck|fox|frog|goose|hamster|penguin|sheep)\.png$/.test(
      path,
    )
  )
    return;
  if (/^mobile\/app\/fonts\/[\w.-]+\.ttf$/.test(path)) return;
  if (/^android\/app\/src\/main\/res\/(?:drawable[^/]*|mipmap[^/]*)\/[\w.@-]+\.png$/.test(path))
    return;
  if (
    /^ios\/App\/App\/Assets\.xcassets\/(?:AppIcon\.appiconset|Splash\.imageset)\/[\w.@-]+\.png$/.test(
      path,
    )
  )
    return;
  if (path === "android/gradle/wrapper/gradle-wrapper.jar") return;
  throw new Error("Unreviewed file type: " + path);
}

export function assertSafeContent(path, buffer) {
  if (buffer.length > 20 * 1024 * 1024)
    throw new Error("File exceeds the publishing check limit: " + path);
  if (buffer.includes(0)) return;
  const text = buffer.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    throw new Error("Possible credential detected in: " + path);
  }
  if (/\.json$/i.test(path)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    const records = Array.isArray(data) ? data : [data];
    if (
      records.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ("expenses_users" in item ||
            "expenses_current_user" in item ||
            ("email" in item && ("password" in item || "profilePhoto" in item))),
      )
    ) {
      throw new Error("Possible exported account data in: " + path);
    }
  }
}
