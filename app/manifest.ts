import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "以树为碑｜苏州古树地图",
    short_name: "以树为碑",
    description: "查阅苏州古树名录，在现场提交并共同核实古树位置。",
    start_url: "/",
    display: "standalone",
    background_color: "#f2eee5",
    theme_color: "#344039",
    lang: "zh-CN",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
