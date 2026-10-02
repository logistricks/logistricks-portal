/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
