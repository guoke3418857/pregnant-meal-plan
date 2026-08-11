/**
 * DeepSeek 食谱生成（前后端共用）
 */

export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

export function buildPrompt(profile, options = {}) {
  const activityLabel =
    {
      1.2: "久坐为主",
      1.375: "轻度活动",
      1.55: "中度活动",
    }[String(profile.activity)] || `活动系数 ${profile.activity}`;

  const avoidDishes = Array.isArray(options.avoidDishes)
    ? options.avoidDishes.filter(Boolean)
    : [];
  const avoidBlock =
    avoidDishes.length > 0
      ? `
上一组食谱中的菜品（本次必须换新，不要重复同名或实质相同的菜）：
${avoidDishes.map((n) => `- ${n}`).join("\n")}
`
      : "";

  const webBlock = options.webContext
    ? `
参考材料：
${options.webContext}
`
    : "";

  return `你是一名熟悉中国孕期营养建议的营养顾问。请根据以下孕妇信息，生成一份「今日」一日食谱（早餐、上午加餐、午餐、下午加餐、晚餐）。

孕妇信息：
- 身高：${profile.height} cm
- 当前体重：${profile.weight} kg
- 年龄：${profile.age} 岁
- 孕周：${profile.week} 周
- 活动量：${activityLabel}
- 饮食偏好：${(profile.prefs || []).join("、") || "无特别偏好"}
- 忌口/过敏：${profile.avoid || "无"}
${avoidBlock}${webBlock}
要求：
1. 菜品符合孕期饮食安全（避免生食、酒精、高汞鱼类、未充分加热的蛋/肉、未巴氏杀菌奶等）。
2. 贴合中国家庭常见食材与做法，分量具体（克/毫升/份）。
3. 估算全日总热量与蛋白质；按孕周阶段给出合理能量目标。
4. 每餐给一句简短食用建议；全文使用简体中文。
5. 同一天内 5 餐主菜尽量有变化；若提供了上一组菜品，必须整体换新。
6. 若有联网灵感，请吸收其中可行做法并重组，避免千篇一律的「鸡胸西兰花」模板。
7. 只输出 JSON，不要 markdown，不要解释。

JSON 结构：
{
  "summary": "一句话总评",
  "targets": {
    "calories": 2100,
    "proteinG": 75,
    "fatG": 65,
    "carbG": 280,
    "bmi": 22.1,
    "trimester": 2
  },
  "mealKcal": 2050,
  "adjustHint": "可选的调整提示，没有可空字符串",
  "meals": [
    {
      "title": "早餐",
      "item": { "name": "菜名", "portion": "具体分量", "tags": ["清淡"], "kcal": 320 },
      "note": "简短建议"
    }
  ]
}

meals 必须恰好包含 5 项，顺序为：早餐、上午加餐、午餐、下午加餐、晚餐。`;
}

export async function generateWithDeepSeek(apiKey, profile, options = {}) {
  const avoidDishes = Array.isArray(options.avoidDishes)
    ? options.avoidDishes
    : [];

  let webContext = options.webContext || "";
  let searchMeta = null;
  if (!webContext) {
    try {
      const { searchRecipeInspiration, formatSearchContext } = await import(
        "./web-search.js"
      );
      searchMeta = await searchRecipeInspiration(profile, { avoidDishes });
      webContext = formatSearchContext(searchMeta);
    } catch (err) {
      console.warn("web search skipped:", err.message);
    }
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: avoidDishes.length || searchMeta?.results?.length ? 0.95 : 0.88,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是孕期营养食谱助手。严格输出合法 JSON 对象，数值合理，遵守孕期饮食安全；结合联网灵感做多样化改编，换一组时要明显避开上一组菜品。内容仅供日常参考，不构成医疗诊断。",
        },
        {
          role: "user",
          content: buildPrompt(profile, { avoidDishes, webContext }),
        },
      ],
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(`DeepSeek 返回非 JSON：${text.slice(0, 200)}`), {
      status: 502,
    });
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 300);
    throw Object.assign(new Error(msg), { status: res.status });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw Object.assign(new Error("DeepSeek 未返回内容"), { status: 502 });
  }

  let plan;
  try {
    plan = JSON.parse(content);
  } catch {
    throw Object.assign(new Error("模型输出无法解析为 JSON"), { status: 502 });
  }

  if (!Array.isArray(plan.meals) || plan.meals.length < 5) {
    throw Object.assign(new Error("食谱结构不完整，请重试"), { status: 502 });
  }

  return {
    plan,
    searchNote: searchMeta?.note || "",
    searchProvider: searchMeta?.provider || null,
  };
}

export function resolveApiKey() {
  // 仅使用服务端环境变量，不接受前端传入的 Key
  return process.env.DEEPSEEK_API_KEY || "";
}

export function formatUpstreamError(err) {
  const cause = err.cause;
  const causeCode = cause?.code || cause?.errno || "";
  const causeMsg = cause?.message || "";
  let message = err.message || "生成失败";

  if (
    message === "fetch failed" ||
    causeCode === "ENOTFOUND" ||
    causeCode === "ECONNREFUSED" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    /timeout/i.test(causeMsg)
  ) {
    message =
      "无法连接 DeepSeek API（网络超时或被拦截）。请检查本机网络；若在 Vercel 上，请打开该次部署的 Function 日志确认。";
    if (causeCode) message += ` [${causeCode}]`;
  }

  const status =
    err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
  return { status, message };
}
