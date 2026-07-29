import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "資産管理 - 月次資産・支払い管理",
    short_name: "資産管理",
    description: "夫婦で利用する自宅の月次資産・クレジットカード支払い管理アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#2a78d6",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
