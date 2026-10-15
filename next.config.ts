import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Full CSP only in production: dev (Turbopack HMR) needs eval/inline it
// would block. The rest of the headers are safe everywhere.
const prodOnlyHeaders = isProd
  ? [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' https:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "font-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ]
  : [];

const nextConfig: NextConfig = {
  /* Auth pages need per-request cookies/session: classic dynamic rendering. */
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...prodOnlyHeaders,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
