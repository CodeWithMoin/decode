import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `make check` runs a production build while `make dev` may be serving. Both
  // default to .next, and the build swaps chunks under the running dev server —
  // which then 500s with "Cannot find module './331.js'". The Makefile sets this
  // so the verification build lands somewhere else entirely.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // There is a real package-lock.json in the home directory (omniroute,
  // agentation), so Next walks up past the repo and picks $HOME as the
  // workspace root. Pin it to this app instead — inference would otherwise
  // trace files from outside the monorepo into the build.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),

  // Waitlist deployment: the studio needs the backend, which isn't deployed here,
  // so send anyone who reaches a studio route back to the landing page.
  async redirects() {
    return [
      { source: "/studio", destination: "/", permanent: false },
      { source: "/studio/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
