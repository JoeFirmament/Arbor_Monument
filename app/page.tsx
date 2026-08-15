import type { Metadata } from "next";
import TreeExplorer from "./TreeExplorer";

export const metadata: Metadata = {
  title: "苏州古树志｜苏州市古树名木地图",
  description: "整理苏州市园林和绿化管理局官方名录，在地图中浏览 2,307 株古树名木。",
};

export default function Home() {
  return <TreeExplorer />;
}
