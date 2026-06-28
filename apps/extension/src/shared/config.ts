declare const __EXTENSION_API_BASE_URL__: string | undefined;
declare const __EXTENSION_WEB_BASE_URL__: string | undefined;

const apiBaseUrl =
  typeof __EXTENSION_API_BASE_URL__ === "string"
    ? __EXTENSION_API_BASE_URL__
    : "http://localhost:3000";
const webBaseUrl =
  typeof __EXTENSION_WEB_BASE_URL__ === "string"
    ? __EXTENSION_WEB_BASE_URL__
    : "http://localhost:3001";

export const extensionConfig = {
  apiBaseUrl,
  webBaseUrl
} as const;
