/**
 * 联网检索菜谱灵感，供 DeepSeek 汇总改编。
 * 检索主题应由 DeepSeek 根据孕妇信息生成后传入 options.themes。
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

/** 无模型主题时的兜底：只用孕妇档案字段，不写死菜系池 */
export function fallbackThemesFromProfile(profile, options = {}) {
  const themes = [];
  const prefs = Array.isArray(profile.prefs) ? profile.prefs.filter(Boolean) : [];
  themes.push(...prefs.slice(0, 2));
  const week = Number(profile.week) || 20;
  if (week <= 12) themes.push("孕早期 清淡易消化");
  else if (week <= 27) themes.push("孕中期 均衡营养");
  else themes.push("孕晚期 补钙补铁");
  if (profile.avoid) themes.push(`避开${String(profile.avoid).split(/[,，、]/)[0]}`);
  if (options.avoidDishes?.length) themes.push("换着吃 不重复");
  return [...new Set(themes.map((t) => String(t).trim()).filter(Boolean))].slice(
    0,
    6
  );
}

export function buildSearchQueries(profile, options = {}) {
  const prefs = (profile.prefs || []).join(" ") || "清淡";
  const week = profile.week || 20;
  const themes =
    options.themes?.length > 0
      ? options.themes
      : fallbackThemesFromProfile(profile, options);

  // 1 条总览 + 每个短关键词各 1 条（词要短，否则搜不到）
  const queries = [`孕期${week}周 ${prefs} 一日三餐 食谱`];
  for (const theme of themes.slice(0, 6)) {
    queries.push(`孕妇 ${theme} 食谱`);
  }
  return [...new Set(queries)].slice(0, 7);
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
    const htmlHits = await searchWithDuckDuckGoHtml(query);
    return { hits: htmlHits, via: "html" };
  } catch (htmlErr) {
    // HTML 版常因反爬/结构变化无结果；Instant Answer API 仍可能返回摘要
    const apiHits = await searchWithDuckDuckGoApi(query);
    console.info(
      `[DDG] HTML 无结果（${htmlErr.message}），已用 Instant Answer API 拿到 ${apiHits.length} 条：${query.slice(0, 40)}`
    );
    return { hits: apiHits, via: "api" };
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
  const themes =
    options.themes?.length > 0
      ? options.themes
      : fallbackThemesFromProfile(profile, options);
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
      ? async (q) => ({
          hits: await searchWithBocha(q, process.env.BOCHA_API_KEY),
          via: "bocha",
        })
      : provider === "serper"
        ? async (q) => ({
            hits: await searchWithSerper(q, process.env.SERPER_API_KEY),
            via: "serper",
          })
        : (q) => searchWithDuckDuckGo(q);

  const chunks = [];
  const vias = new Set();
  for (const q of queries) {
    try {
      const { hits, via } = await searchOne(q);
      if (via) vias.add(via);
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
    if (results.length >= 18) break;
  }

  const providerLabel =
    provider === "duckduckgo"
      ? "DuckDuckGo"
      : provider === "bocha"
        ? "博查"
        : "Serper";

  let note;
  if (!results.length) {
    note = `${providerLabel} 暂无结果，回退档案主题`;
  } else if (provider === "duckduckgo" && vias.has("api") && !vias.has("html")) {
    note = `已通过 DuckDuckGo（Instant Answer）检索 ${results.length} 条灵感`;
  } else {
    note = `已通过 ${providerLabel} 检索 ${results.length} 条灵感`;
  }

  console.info("[web-search]", {
    provider,
    via: [...vias],
    themes,
    queries,
    count: results.length,
    results: results.map((r, i) => ({
      i: i + 1,
      title: r.title,
      snippet: (r.snippet || "").slice(0, 200),
      link: r.link || "",
      query: r.query || "",
    })),
  });

  return {
    provider,
    themes,
    results,
    note,
  };
}

export function formatSearchContext(searchPayload) {
  const themes = searchPayload?.themes || [];
  const results = searchPayload?.results || [];
  const themeLine = themes.length
    ? `今日食谱方向（由模型根据孕妇信息拟定，请融入但勿生硬堆砌）：${themes.join("、")}`
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
