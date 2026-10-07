import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseProperties } from "./android-config.mjs";

export function androidEnvironment(root) {
  const local = join(root, "android/local.properties");
  const sdk =
    (existsSync(local) ? parseProperties(readFileSync(local, "utf8"))["sdk.dir"] : "") ||
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(join(sdk, "platforms/android-36/android.jar"))) {
    throw new Error(
      "Android SDK 36 is missing. Install it with Android Studio, then set ANDROID_HOME or android/local.properties. See README.md → Android.",
    );
  }
  const javaHome =
    process.env.JAVA_HOME ||
    (process.platform === "win32" && existsSync("C:/Program Files/Android/Android Studio/jbr")
      ? "C:/Program Files/Android/Android Studio/jbr"
      : "");
  const java = javaHome
    ? join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
  const result = spawnSync(java, ["-version"], { encoding: "utf8" });
  const major = Number((result.stderr || "").match(/version "(\d+)/)?.[1]);
  if (result.status !== 0 || major < 21 || !major)
    throw new Error("Java 21+ is required. Set JAVA_HOME to Android Studio's jbr directory.");
  return {
    ...process.env,
    ANDROID_HOME: resolve(sdk),
    ANDROID_SDK_ROOT: resolve(sdk),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    GRADLE_USER_HOME: join(root, ".android-build/gradle"),
  };
}
