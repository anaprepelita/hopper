import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "mobile-dist/**",
      ".mobile-live/**",
      ".android-build/**",
      "Android Pack/**",
      "artifacts/**",
      "android/**",
      "ios/**",
      "mobile/app/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, Deno: "readonly" } },
    rules: js.configs.recommended.rules,
  },
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.recommended,
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  prettier,
);
