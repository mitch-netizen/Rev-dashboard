import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist dynamically imports its worker script by a relative path at
  // runtime; letting Next's bundler trace/chunk it breaks that path in the
  // deployed serverless function ("Cannot find module .../pdf.worker.mjs").
  // Marking it external skips bundling and resolves it via normal
  // node_modules lookup instead, which is what actually exists on disk.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
