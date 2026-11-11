import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BALMZ AI — Your AI Workplace",
    short_name: "BALMZ AI",
    description: "Your secure BALMZ AI workplace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#080D15",
    theme_color: "#080D15",
    icons: [
      {
        src: "/balmz-logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
