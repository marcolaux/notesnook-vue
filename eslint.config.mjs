import eslint from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "vendor/**",
      "vendor-dist/**",
      "dist/**",
      "out/**",
      "node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/.vite/**"
    ]
  },
  eslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "off"
    }
  }
];
