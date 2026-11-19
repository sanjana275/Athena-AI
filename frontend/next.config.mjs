/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const isExport = process.env.NEXT_EXPORT === "true";

const nextConfig = {
  reactStrictMode: true,
  ...(isExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
        },
      }),
};

export default nextConfig;
