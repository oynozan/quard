import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactCompiler: true,
    devIndicators: false,
    // A small server folder for the Docker image, traced from the repo root
    output: "standalone",
    outputFileTracingRoot: path.join(import.meta.dirname, ".."),
    // The server applies migrations on start, so the SQL files ship with it
    outputFileTracingIncludes: { "/*": ["../db/migrations/*.sql"] },
};

export default nextConfig;
