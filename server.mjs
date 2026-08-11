#!/usr/bin/env node
/**
 * Node/Express 后端：/api/* ；生产环境同时托管 Vite 构建产物 dist/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  generateWithDeepSeek,
  resolveApiKey,
  formatUpstreamError,
  MODEL,
} from "./lib/deepseek.js";
import { getPublicConfig } from "./lib/public-config.js";
import { getSearchProvider } from "./lib/web-search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  try {
    const text = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* .env 可选 */
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 8765);
const isProd = process.env.NODE_ENV === "production";
const distDir = path.join(__dirname, "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/public-config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getPublicConfig());
});

app.post("/api/generate", async (req, res) => {
  try {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      res.status(400).json({
        error: "未配置 DeepSeek API Key。请在环境变量中设置 DEEPSEEK_API_KEY。",
      });
      return;
    }
    if (!req.body?.profile) {
      res.status(400).json({ error: "缺少孕妇信息 profile" });
      return;
    }
    const { plan, searchNote, searchProvider } = await generateWithDeepSeek(
      apiKey,
      req.body.profile,
      {
        avoidDishes: Array.isArray(req.body.avoidDishes)
          ? req.body.avoidDishes
          : [],
      }
    );
    res.json({
      ok: true,
      plan,
      searchNote,
      searchProvider,
      source: "deepseek",
    });
  } catch (err) {
    const { status, message } = formatUpstreamError(err);
    res.status(status).json({ error: message });
  }
});

if (isProd && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API 服务：http://127.0.0.1:${PORT}`);
  if (!isProd) {
    console.log("开发前端请另开 Vite：http://127.0.0.1:5173 （npm run dev）");
  }
  console.log(`DeepSeek 模型：${MODEL}`);
  console.log(
    process.env.DEEPSEEK_API_KEY
      ? "已检测到 DEEPSEEK_API_KEY"
      : "未检测到 DEEPSEEK_API_KEY"
  );
  const cfg = getPublicConfig();
  console.log(
    cfg.configured
      ? "已检测到 Supabase 公开配置"
      : "未检测到 SUPABASE_URL / SUPABASE_ANON_KEY"
  );
  const searchProvider = getSearchProvider();
  console.log(
    searchProvider
      ? `已启用联网搜索：${searchProvider}${
          searchProvider === "duckduckgo" ? "（免费，无需 Key）" : ""
        }`
      : "联网搜索已关闭（WEB_SEARCH_PROVIDER=off）"
  );
});
