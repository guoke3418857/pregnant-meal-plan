#!/usr/bin/env node
/**
 * 本地开发：静态 public/ + /api/generate
 * 生产环境请用 Vercel 部署（api/ + public/）。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateWithDeepSeek,
  resolveApiKey,
  formatUpstreamError,
  MODEL,
} from "./lib/deepseek.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(
    new URL(req.url, `http://${req.headers.host}`).pathname
  );
  if (urlPath === "/") urlPath = "/index.html";

  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS" && url.pathname === "/api/generate") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const apiKey = resolveApiKey({
        bodyKey: body.apiKey,
        headerAuth: req.headers.authorization,
      });

      if (!apiKey) {
        sendJson(res, 400, {
          error:
            "未配置 DeepSeek API Key。本地可在 .env 设置 DEEPSEEK_API_KEY，或在页面高级选项中填写。",
        });
        return;
      }
      if (!body.profile) {
        sendJson(res, 400, { error: "缺少孕妇信息 profile" });
        return;
      }

      const plan = await generateWithDeepSeek(apiKey, body.profile);
      sendJson(res, 200, { ok: true, plan, source: "deepseek" });
    } catch (err) {
      if (err instanceof SyntaxError) {
        sendJson(res, 400, { error: "请求体不是合法 JSON" });
        return;
      }
      const { status, message } = formatUpstreamError(err);
      sendJson(res, status, { error: message });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`安孕食谱本地服务：http://127.0.0.1:${PORT}`);
  console.log(`DeepSeek 模型：${MODEL}`);
  if (process.env.DEEPSEEK_API_KEY) {
    console.log("已检测到 DEEPSEEK_API_KEY（页面可不填 Key）");
  } else {
    console.log("未检测到环境变量 Key，可在页面「高级选项」填写");
  }
});
