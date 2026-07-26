import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Skill Gaming World",
    short_name: "SGW",
    description:
      "Monetaire competitive solitaire with transparent rules and player-first controls.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#07110f",
    theme_color: "#07110f",
    orientation: "any",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
