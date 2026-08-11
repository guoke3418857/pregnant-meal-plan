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

/** 用维度组合出随机侧重（组合空间大），避免从固定短语池里抽 */
const COOK_METHODS = [
  "清蒸",
  "快炒",
  "煲汤",
  "凉拌",
  "炖煮",
  "焯水",
  "少油烤",
  "砂锅",
];
const FOOD_CLASSES = [
  "叶菜",
  "菌菇",
  "豆腐",
  "鸡肉",
  "鱼虾",
  "薯类",
  "鸡蛋",
  "牛奶",
  "杂粮",
  "瓜类",
  "海带",
  "瘦肉",
];
const NUTRITION_GOALS = [
  "开胃",
  "补钙",
  "补铁",
  "高纤",
  "易消化",
  "少油",
  "暖胃",
  "高蛋白",
];
const MEAL_SLOTS = ["早餐", "上午加餐", "午餐", "下午加餐", "晚餐"];

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickUnique(list, count) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** 每次组合出新的侧重提示，并给出可直接搜索的短词兜底 */
function buildRandomFocusHints(count = 3) {
  const methods = pickUnique(COOK_METHODS, count);
  const foods = pickUnique(FOOD_CLASSES, count);
  const goals = pickUnique(NUTRITION_GOALS, count);
  const slots = pickUnique(MEAL_SLOTS, count);
  return Array.from({ length: count }, (_, i) => {
    const method = methods[i] || pickOne(COOK_METHODS);
    const food = foods[i] || pickOne(FOOD_CLASSES);
    const goal = goals[i] || pickOne(NUTRITION_GOALS);
    return {
      slot: slots[i] || pickOne(MEAL_SLOTS),
      method,
      food,
      goal,
      hint: `${method} + ${food} + ${goal}`,
      // 短词，适合搜「孕妇 xxx 食谱」
      searchKeyword: `${method}${food}`.slice(0, 6),
    };
  });
}

/** 搜索主题必须短、常见，否则 DuckDuckGo 等基本无结果 */
function isSearchableTheme(theme) {
  const s = String(theme || "").trim();
  if (s.length < 2 || s.length > 6) return false;
  if (/[＋+]/.test(s)) return false;
  if (
    /(晨间|午间|暮色|脆片|鸡柳|香草|滋补|叶酸暖|南瓜籽|桂花|砂锅炖|蒸鸡柳)/.test(
      s
    )
  ) {
    return false;
  }
  return true;
}

function sanitizeThemes(rawThemes, focusHints, avoidThemes = []) {
  const avoid = new Set(avoidThemes.map((t) => String(t).trim()));
  const cleaned = [];
  for (const t of rawThemes || []) {
    const s = String(t || "").trim();
    if (!isSearchableTheme(s) || avoid.has(s) || cleaned.includes(s)) continue;
    cleaned.push(s);
  }
  // 不够时用维度短词补齐（保证能搜）
  for (const h of focusHints) {
    for (const kw of [h.searchKeyword, h.food, `${h.food}汤`, h.goal]) {
      const s = String(kw || "").trim().slice(0, 6);
      if (s.length < 2 || s.length > 6 || avoid.has(s) || cleaned.includes(s)) {
        continue;
      }
      cleaned.push(s);
      if (cleaned.length >= 6) return cleaned.slice(0, 6);
    }
  }
  // 最后再用食材类随机补
  for (const food of pickUnique(FOOD_CLASSES, 6)) {
    if (avoid.has(food) || cleaned.includes(food)) continue;
    cleaned.push(food);
    if (cleaned.length >= 6) break;
  }
  return cleaned.slice(0, 6);
}

/** 根据孕妇档案生成检索主题（短词），供联网搜索使用 */
export async function generateSearchThemes(apiKey, profile, options = {}) {
  const avoidDishes = Array.isArray(options.avoidDishes)
    ? options.avoidDishes.filter(Boolean)
    : [];
  const avoidThemes = Array.isArray(options.avoidThemes)
    ? options.avoidThemes.filter(Boolean)
    : [];
  const focusHints = buildRandomFocusHints(3);
  const activityLabel =
    {
      1.2: "久坐为主",
      1.375: "轻度活动",
      1.55: "中度活动",
    }[String(profile.activity)] || `活动系数 ${profile.activity}`;

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 1.0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是孕期营养顾问。只输出 JSON。themes 必须是能直接丢进搜索引擎的短关键词（2–6个汉字），不是菜名、不是文艺标题。",
        },
        {
          role: "user",
          content: `生成 6 个孕妇食谱「搜索关键词」。

合格示例：菌菇汤、杂粮饭、清蒸鱼、凉拌菜、补钙、鸡蛋羹、番茄炒蛋、瘦肉粥
不合格（禁止）：晨间叶酸暖胃羹、柠檬香草蒸鸡柳、香烤南瓜籽脆片、暮色菌菇钙汤煨、午间杂粮砂锅炖

规则：
- 每条只要 2–6 个汉字
- 像百度会搜到很多家常菜的词，不要诗意包装，不要菜品全称
- 其中 3 条贴近下列随机维度（写成短词，不要拼接成长标题）：
${focusHints.map((f) => `- ${f.slot}：${f.hint}`).join("\n")}
- 另外 3 条换方向自由写，同样保持短词
- 贴合孕周与偏好；避开忌口

孕妇信息：
- 孕周 ${profile.week}，活动量 ${activityLabel}
- 偏好：${(profile.prefs || []).join("、") || "无"}
- 忌口：${profile.avoid || "无"}
${
  avoidDishes.length
    ? `- 上一组菜品（避开同类词）：${avoidDishes.join("、")}`
    : ""
}
${
  avoidThemes.length
    ? `- 上一组关键词（禁止相同）：${avoidThemes.join("、")}`
    : ""
}

输出 JSON：{ "themes": ["短词1", "短词2", "短词3", "短词4", "短词5", "短词6"] }`,
        },
      ],
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`主题生成返回非 JSON：${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || "主题生成失败");
  }

  const content = data?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("主题生成结果无法解析");
  }

  const raw = Array.isArray(parsed.themes) ? parsed.themes : [];
  const themes = sanitizeThemes(raw, focusHints, avoidThemes);

  if (!themes.length) {
    throw new Error("主题生成结果为空");
  }
  console.info("[deepseek-theme-focus]", focusHints);
  console.info("[deepseek-themes-raw]", raw);
  console.info("[deepseek-themes]", themes);
  return themes;
}

export async function generateWithDeepSeek(apiKey, profile, options = {}) {
  const avoidDishes = Array.isArray(options.avoidDishes)
    ? options.avoidDishes
    : [];
  const avoidThemes = Array.isArray(options.avoidThemes)
    ? options.avoidThemes
    : [];

  let webContext = options.webContext || "";
  let searchMeta = null;
  if (!webContext) {
    try {
      const { searchRecipeInspiration, formatSearchContext } = await import(
        "./web-search.js"
      );
      let themes = options.themes;
      try {
        themes = await generateSearchThemes(apiKey, profile, {
          avoidDishes,
          avoidThemes,
        });
      } catch (err) {
        console.warn("theme generation fallback:", err.message);
      }
      searchMeta = await searchRecipeInspiration(profile, {
        avoidDishes,
        themes,
      });
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
    themes: searchMeta?.themes || [],
    searchDebug: searchMeta?.debug || null,
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
