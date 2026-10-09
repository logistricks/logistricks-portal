import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mailparser", "imapflow", "@kenjiuno/msgreader"],
  outputFileTracingIncludes: {
    "/api/quotations/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/trial/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
