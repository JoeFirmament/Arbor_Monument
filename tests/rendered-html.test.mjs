import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://suzhou-trees.example/", {
      headers: { accept: "text/html", host: "suzhou-trees.example" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Suzhou ancient-tree explorer", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /苏州古树志/);
  assert.match(html, /2024 年苏州市古树名木资源普查/);
  assert.match(html, /寻一棵古树/);
  assert.match(html, /点位说明/);
  assert.match(html, /下载整理数据/);
  assert.match(html, /property="og:image" content="https:\/\/suzhou-trees\.example\/og\.png"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the complete structured official catalogue", async () => {
  const [dataText, csvText] = await Promise.all([
    readFile(new URL("../public/data/trees.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/trees.csv", import.meta.url), "utf8"),
  ]);
  const data = JSON.parse(dataText);
  assert.equal(data.meta.recordCount, 2307);
  assert.equal(data.meta.catalogCount, 11);
  assert.equal(data.records.length, 2307);
  assert.equal(data.records.filter((tree) => tree.grade === "一级").length, 163);
  assert.equal(data.records.filter((tree) => tree.grade === "二级").length, 396);
  assert.equal(data.records.filter((tree) => tree.grade === "三级").length, 1748);
  assert.match(data.meta.coordinateNote, /未提供经纬度/);
  assert.equal(csvText.trim().split(/\r?\n/).length, 2308);
});
