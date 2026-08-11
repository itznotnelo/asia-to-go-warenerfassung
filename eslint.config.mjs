import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "electron/app/**",
      "electron/release/**",
      "electron/resources/**",
    ],
  },
  {
    // Plain Node scripts run standalone outside the Next/TS toolchain
    // (postbuild steps, CI helpers) — CommonJS require() is intentional.
    files: ["scripts/**/*.cjs", "electron-builder.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
