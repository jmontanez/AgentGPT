import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives inside a repo whose root ESLint config targets a different project.
  eslint: { ignoreDuringBuilds: true },
  // The parent repo has its own package-lock.json; pin the root so Next doesn't trace files from it.
  outputFileTracingRoot: here,
};
export default nextConfig;
