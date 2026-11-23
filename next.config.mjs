/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp"],
  async headers() {
    if (process.env.VERCEL_ENV !== "preview") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] }];
  },
};
export default nextConfig;
