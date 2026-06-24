import sharedConfig from "./packages/config/eslint.config.mjs";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", ".next/**", "coverage/**", "pnpm-lock.yaml"]
  },
  ...sharedConfig
];
