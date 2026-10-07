import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Provisional: confirm ownership/availability before the first store release.
  appId: "ro.hopper.budget",
  appName: "Hopper",
  webDir: "mobile-dist",
  backgroundColor: "#fbe4ee",
  loggingBehavior: "debug",
  server: {
    hostname: "localhost",
    androidScheme: "https",
    iosScheme: "capacitor",
    errorPath: "app/webview-update.html",
    // Keep these stable after release: the origin owns the existing local data.
  },
  android: { allowMixedContent: false, minWebViewVersion: 105 },
  ios: { contentInset: "never", preferredContentMode: "mobile" },
  plugins: {
    SystemBars: { insetsHandling: "css", style: "LIGHT", hidden: false },
  },
};

export default config;
