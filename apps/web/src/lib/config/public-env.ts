export const publicEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  extensionInstallUrl: process.env.NEXT_PUBLIC_EXTENSION_INSTALL_URL ?? ""
} as const;
