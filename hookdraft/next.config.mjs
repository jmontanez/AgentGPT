/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives inside a repo whose root ESLint config targets a different project.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
