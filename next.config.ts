import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "telegram",
    "telegram/sessions",
    "telegram/tl",
    "telegram/Password",
    "websocket",
    "ws",
    "big-integer",
  ],
  async headers() {
    return [
      {
        source: "/trademiles.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
