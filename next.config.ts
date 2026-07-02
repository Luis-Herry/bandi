import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lain.bgm.tv" },
      { protocol: "https", hostname: "bangumi.tv" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "pics.dmm.co.jp" },
    ],
  },
};

export default nextConfig;
