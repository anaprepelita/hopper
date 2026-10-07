export function parseProperties(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*[#!]/.test(line)) continue;
    const match = line.match(/^\s*([^\s=]+)\s*=\s*(.*?)\s*$/);
    if (match) {
      values[match[1]] = match[2].replace(/\\(u[\da-fA-F]{4}|.)/g, (_, value) =>
        value.startsWith("u") ? String.fromCharCode(parseInt(value.slice(1), 16)) : value,
      );
    }
  }
  return values;
}

export function androidVersion(text) {
  const properties = parseProperties(text);
  const code = Number(properties.versionCode);
  if (
    !/^\d+$/.test(properties.versionCode || "") ||
    !Number.isSafeInteger(code) ||
    code < 1 ||
    code > 2100000000
  ) {
    throw new Error("versionCode must be a positive Android release number (maximum 2100000000).");
  }
  if (!/^\d+(?:\.\d+){1,2}$/.test(properties.versionName || "")) {
    throw new Error("versionName must be numeric, for example 1.0 or 1.0.1.");
  }
  return { code, name: properties.versionName };
}

export function androidTargets(mode) {
  const apk = {
    task: ":app:assembleRelease",
    distribution: "apk",
    source: "apk/release/app-release.apk",
    extension: "apk",
    suffix: "",
  };
  const aab = {
    task: ":app:bundleRelease",
    distribution: "play",
    source: "bundle/release/app-release.aab",
    extension: "aab",
    suffix: "",
  };
  if (mode === "apk") return [apk];
  if (mode === "aab") return [aab];
  if (mode === "release") return [apk, aab];
  if (mode === "debug-apk")
    return [
      {
        task: ":app:assembleDebug",
        distribution: "apk",
        source: "apk/debug/app-debug.apk",
        extension: "apk",
        suffix: "-debug",
      },
    ];
  throw new Error("Choose debug-apk, apk, aab or release.");
}
