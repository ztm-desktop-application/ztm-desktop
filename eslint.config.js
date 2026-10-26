import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-ssr/**",
      "playwright-report/**",
      "test-results/**",
      ".amp/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      "src-tauri/vendor/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src-tauri/src/academy_init.js"],
    // Storage access is best-effort in the injected Academy script.
    rules: { "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["src/**/*.{ts,tsx}", "src-tauri/src/academy_init.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["*.{js,ts}", "tests/**/*.{mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**/*.spec.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src-tauri/src/academy_init.js"],
    languageOptions: {
      globals: {
        __ZTM_AUTH_ROUTES__: "readonly",
        __ZTM_THEME_STORAGE_KEY__: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
    ],
    settings: { react: { version: "detect" } },
    rules: {
      // Component props are already checked by TypeScript.
      "react/prop-types": "off",
    },
  },
  prettier,
);
