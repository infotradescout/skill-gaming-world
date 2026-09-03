import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  // The exported Godot runtime is intentionally embedded by the same-origin
  // authenticated player route. It remains unavailable to cross-origin frames.
  "frame-ancestors 'self'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  // Godot's WebAssembly loader needs this narrow CSP capability; regular
  // JavaScript eval remains disabled.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ");

// The owner-only Platynum companion opens a loopback-only workspace on the
// same computer. Do not force that one explicit http://127.0.0.1 navigation to
// HTTPS; every other site route keeps the global upgrade rule.
const platynumCompanionContentSecurityPolicy = contentSecurityPolicy.replace(
  "; upgrade-insecure-requests",
  "",
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        source: "/admin/platynum",
        headers: [
          {
            key: "Content-Security-Policy",
            value: platynumCompanionContentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
