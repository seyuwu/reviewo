import sharedConfig from "./packages/config/eslint.config.mjs";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "pnpm-lock.yaml"
    ]
  },
  ...sharedConfig
];
