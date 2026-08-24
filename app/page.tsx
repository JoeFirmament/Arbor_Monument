import type { Metadata } from "next";
import TreeExplorer from "./TreeExplorer";

export const metadata: Metadata = {
  title: "以树为碑｜苏州古树地图",
  description: "从苏州官方古树名录出发，选择一株树，进入它独有的生命档案。",
};

export default function Home() {
  return <TreeExplorer />;
}
