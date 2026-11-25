/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mailparser", "imapflow", "@kenjiuno/msgreader"],
  outputFileTracingIncludes: {
    "/api/quotations/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/trial/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      // Conservative CSP: no framing, no plugins, no foreign form targets or base tags. Script/style stay open because Next injects inline bootstrap scripts (tighten later with nonces).
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ]
    return [{ source: "/:path*", headers: security }]
  },
}

export default nextConfig
