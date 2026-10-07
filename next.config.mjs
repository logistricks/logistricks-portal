/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mailparser", "imapflow", "@kenjiuno/msgreader"],
  outputFileTracingIncludes: {
    "/api/quotations/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
