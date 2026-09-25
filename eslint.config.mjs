import sharedConfig from "./packages/config/eslint.config.mjs";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/dist-test/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "**/src/generated/**",
      "pnpm-lock.yaml",
      "web-page.js"
    ]
  },
  ...sharedConfig
];
