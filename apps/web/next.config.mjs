validatePublicEnvironment();

const watchPollIntervalMs = Number(process.env.WATCHPACK_POLLING_INTERVAL ?? "1000");

/** @type {import("next").NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev && process.env.WATCHPACK_POLLING === "true") {
      config.watchOptions = {
        aggregateTimeout: 300,
        poll: watchPollIntervalMs
      };
    }

    return config;
  },
  async headers() {
    return [
      {
        headers: createEmbedHeaders(),
        source: "/embed/:path*"
      },
      {
        headers: createSecurityHeaders(),
        source: "/:path*"
      }
    ];
  },
  reactStrictMode: true,
  transpilePackages: ["@reviewo/i18n"]
};

export default nextConfig;

function createEmbedHeaders() {
  return [
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors *"
    }
  ];
}

function createSecurityHeaders() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  const apiOrigin = resolveOrigin(apiBaseUrl);
  const websocketOrigin = resolveWebSocketOrigin(apiBaseUrl);
  const connectSources = [
    "'self'",
    apiOrigin,
    websocketOrigin,
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com"
  ].filter(Boolean);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(" ")}`
  ].join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()"
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin"
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=15552000; includeSubDomains"
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff"
    },
    {
      key: "X-Frame-Options",
      value: "DENY"
    }
  ];
}

function resolveOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function resolveWebSocketOrigin(value) {
  try {
    const url = new URL(value);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    return url.origin;
  } catch {
    return "";
  }
}

function validatePublicEnvironment() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

  if (process.env.NODE_ENV === "production") {
    if (!isHttpsOrLocalhost(apiBaseUrl)) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must use HTTPS in production");
    }

    if (!isHttpsOrLocalhost(siteUrl)) {
      throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production");
    }
  }
}

function isHttpsOrLocalhost(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}
