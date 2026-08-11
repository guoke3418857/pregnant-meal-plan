import {
  generateWithDeepSeek,
  resolveApiKey,
  formatUpstreamError,
} from "../lib/deepseek.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const apiKey = resolveApiKey();

    if (!apiKey) {
      res.status(400).json({
        error:
          "未配置 DeepSeek API Key。请在服务器环境变量中设置 DEEPSEEK_API_KEY。",
      });
      return;
    }

    if (!body.profile) {
      res.status(400).json({ error: "缺少孕妇信息 profile" });
      return;
    }

    const { plan, searchNote, searchProvider } = await generateWithDeepSeek(
      apiKey,
      body.profile,
      {
        avoidDishes: Array.isArray(body.avoidDishes) ? body.avoidDishes : [],
      }
    );
    res.status(200).json({
      ok: true,
      plan,
      searchNote,
      searchProvider,
      source: "deepseek",
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "请求体不是合法 JSON" });
      return;
    }
    const { status, message } = formatUpstreamError(err);
    res.status(status).json({ error: message });
  }
}
