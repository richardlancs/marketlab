import type { MetadataRoute } from "next";

/**
 * The web app manifest (/manifest.webmanifest): what lets browsers install
 * MarketLab like an app, with its own icon and window. Icons are drawn by
 * scripts/make-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MarketLab",
    short_name: "MarketLab",
    description: "Stock analysis and portfolio simulator",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
