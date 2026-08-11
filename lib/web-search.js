/**
 * 联网检索菜谱灵感，供 DeepSeek 汇总改编。
 * 优先级：
 * 1. BOCHA_API_KEY（博查）
 * 2. SERPER_API_KEY（Serper）
 * 3. DuckDuckGo（默认免费，无需 Key）
 * 设 WEB_SEARCH_PROVIDER=off 可关闭联网
 */

const SERPER_URL = "https://google.serper.dev/search";
const BOCHA_URL = "https://api.bochaai.com/v1/web-search";
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_API_URL = "https://api.duckduckgo.com/";

const THEME_POOL = [
  "时令蔬菜",
  "补铁红肉或动物血豆腐",
  "深海鱼或虾仁",
  "豆制品与菌菇",
  "杂粮主食",
  "汤羹暖胃",
  "清蒸少油",
  "奶制品补钙",
  "深色叶菜",
  "蛋类优质蛋白",
  "南瓜芋头薯类",
  "家常小炒清淡版",
];

export function pickVarietyThemes(count = 3) {
  const pool = [...THEME_POOL];
  const picked = [];
  while (picked.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export function buildSearchQueries(profile, options = {}) {
  const prefs = (profile.prefs || []).join(" ") || "清淡";
  const week = profile.week || 20;
  const themes = options.themes?.length ? options.themes : pickVarietyThemes(2);
  const avoidHint = (options.avoidDishes || []).slice(0, 3).join(" ");
  const queries = [
    `孕期${week}周 ${prefs} 一日三餐 食谱`,
    `孕妇 ${themes[0] || "清淡"} 家常菜 做法`,
    `孕期营养 ${themes[1] || "补铁"} 食谱 推荐`,
  ];
  if (avoidHint) {
    queries.push(`孕妇食谱 换着吃 不重复 ${themes[0] || ""}`);
  }
  return queries.slice(0, 3);
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapDuckLink(href) {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

async function searchWithSerper(query, apiKey) {
  const res = await fetch(SERPER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, gl: "cn", hl: "zh-cn", num: 5 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Serper 搜索失败（${res.status}）`);
  }
  const items = [
    ...(data.organic || []),
    ...(data.answerBox ? [data.answerBox] : []),
  ];
  return items
    .map((it) => ({
      title: it.title || "",
      snippet: it.snippet || it.answer || it.description || "",
      link: it.link || "",
    }))
    .filter((it) => it.title || it.snippet)
    .slice(0, 5);
}

async function searchWithBocha(query, apiKey) {
  const res = await fetch(BOCHA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      freshness: "oneYear",
      summary: true,
      count: 5,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `博查搜索失败（${res.status}）`);
  }
  const list = data?.data?.webPages?.value || data?.webPages?.value || [];
  return list
    .map((it) => ({
      title: it.name || it.title || "",
      snippet: it.summary || it.snippet || it.fullSummary || "",
      link: it.url || it.link || "",
    }))
    .filter((it) => it.title || it.snippet)
    .slice(0, 5);
}

async function searchWithDuckDuckGoApi(query) {
  const url = `${DDG_API_URL}?${new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
  })}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PregnantMealPlan/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`DuckDuckGo API 失败（${res.status}）`);
  const data = await res.json();
  const out = [];
  if (data.AbstractText) {
    out.push({
      title: data.Heading || query,
      snippet: data.AbstractText,
      link: data.AbstractURL || "",
    });
  }
  for (const topic of data.RelatedTopics || []) {
    if (topic.Text) {
      out.push({
        title: (topic.Text || "").split(" - ")[0] || query,
        snippet: topic.Text,
        link: topic.FirstURL || "",
      });
    }
    for (const t of topic.Topics || []) {
      if (t.Text) {
        out.push({
          title: (t.Text || "").split(" - ")[0] || query,
          snippet: t.Text,
          link: t.FirstURL || "",
        });
      }
    }
  }
  return out.slice(0, 5);
}

async function searchWithDuckDuckGoHtml(query) {
  const url = `${DDG_HTML_URL}?${new URLSearchParams({ q: query })}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Accept: "text/html",
    },
  });
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`DuckDuckGo HTML 搜索失败（${res.status}）`);
  }

  const titles = [];
  const titleRe =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = titleRe.exec(html)) !== null) {
    titles.push({
      link: unwrapDuckLink(decodeHtml(m[1])),
      title: decodeHtml(m[2]),
    });
  }

  const snippets = [];
  const snipRe =
    /class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  while ((m = snipRe.exec(html)) !== null) {
    snippets.push(decodeHtml(m[1]));
  }

  const results = titles.slice(0, 5).map((t, i) => ({
    title: t.title,
    snippet: snippets[i] || "",
    link: t.link,
  }));

  if (!results.length) {
    throw new Error("DuckDuckGo HTML 无结果");
  }
  return results;
}

async function searchWithDuckDuckGo(query) {
  try {
    return await searchWithDuckDuckGoHtml(query);
  } catch (htmlErr) {
    console.warn("DDG HTML failed, fallback API:", htmlErr.message);
    return searchWithDuckDuckGoApi(query);
  }
}

export function getSearchProvider() {
  const forced = (process.env.WEB_SEARCH_PROVIDER || "").toLowerCase().trim();
  if (forced === "off" || forced === "none") return null;
  if (forced === "duckduckgo" || forced === "ddg") return "duckduckgo";
  if (forced === "bocha" && process.env.BOCHA_API_KEY) return "bocha";
  if (forced === "serper" && process.env.SERPER_API_KEY) return "serper";

  if (process.env.BOCHA_API_KEY) return "bocha";
  if (process.env.SERPER_API_KEY) return "serper";
  return "duckduckgo";
}

export async function searchRecipeInspiration(profile, options = {}) {
  const provider = getSearchProvider();
  const themes = pickVarietyThemes(3);
  const queries = buildSearchQueries(profile, {
    ...options,
    themes,
  });

  if (!provider) {
    return {
      provider: null,
      themes,
      results: [],
      note: "已关闭联网搜索，仅使用随机主题增强多样性",
    };
  }

  const searchOne =
    provider === "bocha"
      ? (q) => searchWithBocha(q, process.env.BOCHA_API_KEY)
      : provider === "serper"
        ? (q) => searchWithSerper(q, process.env.SERPER_API_KEY)
        : (q) => searchWithDuckDuckGo(q);

  const chunks = [];
  for (const q of queries) {
    try {
      const hits = await searchOne(q);
      chunks.push(
        ...hits.map((h) => ({
          ...h,
          query: q,
        }))
      );
    } catch (err) {
      console.warn("web search failed:", q, err.message);
    }
  }

  const seen = new Set();
  const results = [];
  for (const item of chunks) {
    const key = (item.title || item.snippet).slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= 10) break;
  }

  const providerLabel =
    provider === "duckduckgo"
      ? "DuckDuckGo"
      : provider === "bocha"
        ? "博查"
        : "Serper";

  return {
    provider,
    themes,
    results,
    note: results.length
      ? `已通过 ${providerLabel} 检索 ${results.length} 条灵感`
      : `${providerLabel} 暂无结果，回退随机主题`,
  };
}

export function formatSearchContext(searchPayload) {
  const themes = searchPayload?.themes || [];
  const results = searchPayload?.results || [];
  const themeLine = themes.length
    ? `今日多样性主题（请融入，但勿生硬堆砌）：${themes.join("、")}`
    : "";

  if (!results.length) {
    return `${themeLine}\n（无联网结果，请自行发挥更丰富的家常搭配，避免总是粥+鸡胸+西兰花固定组合。）`;
  }

  const lines = results.map((r, i) => {
    const snip = (r.snippet || "").replace(/\s+/g, " ").slice(0, 160);
    return `${i + 1}. ${r.title}${snip ? ` — ${snip}` : ""}`;
  });

  return `${themeLine}

联网检索到的菜谱灵感（仅作灵感，请按孕期安全与用户忌口改编成今日完整食谱，不要照抄原文，不要输出链接）：
${lines.join("\n")}`;
}
