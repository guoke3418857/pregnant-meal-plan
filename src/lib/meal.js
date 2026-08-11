/**
 * 前端餐谱结果规范化
 */

export function trimesterOf(week) {
  if (week <= 12) return 1;
  if (week <= 27) return 2;
  return 3;
}

export const ACTIVITY_LABELS = {
  1.2: "久坐为主",
  1.375: "轻度活动",
  1.55: "中度活动",
};

export function profileFromRow(row) {
  if (!row || row.height == null) return null;
  return {
    height: Number(row.height),
    weight: Number(row.weight),
    age: Number(row.age),
    week: Number(row.week),
    activity: Number(row.activity),
    avoid: row.avoid || "",
    prefs: Array.isArray(row.prefs) ? row.prefs : [],
  };
}

export function isProfileComplete(profile) {
  return Boolean(
    profile &&
      profile.height &&
      profile.weight &&
      profile.age &&
      profile.week &&
      profile.activity
  );
}

export function summarizeProfile(profile) {
  const act =
    ACTIVITY_LABELS[profile.activity] || `活动系数 ${profile.activity}`;
  const prefs = profile.prefs?.length ? profile.prefs.join("、") : "无特别偏好";
  const avoid = profile.avoid || "无";
  return `身高 ${profile.height} cm · 体重 ${profile.weight} kg · ${profile.age} 岁 · 孕 ${profile.week} 周 · ${act} · 偏好：${prefs} · 忌口：${avoid}`;
}

export function normalizePlan(plan, profile) {
  const week = profile.week;
  const bmi =
    plan?.targets?.bmi ??
    Number((profile.weight / (profile.height / 100) ** 2).toFixed(1));
  const trimester = plan?.targets?.trimester ?? trimesterOf(week);
  const meals = (plan.meals || []).map((m) => ({
    title: m.title || "餐次",
    note: m.note || "",
    item: {
      name: m.item?.name || m.name || "待定菜品",
      portion: m.item?.portion || m.portion || "",
      tags: m.item?.tags || m.tags || [],
      kcal: Number(m.item?.kcal ?? m.kcal ?? 0),
    },
  }));

  const mealKcal =
    Number(plan.mealKcal) ||
    meals.reduce((s, m) => s + (Number(m.item.kcal) || 0), 0);

  return {
    summary: plan.summary || "",
    adjustHint: plan.adjustHint || "",
    mealKcal,
    targets: {
      calories: Number(plan.targets?.calories) || mealKcal,
      proteinG: Number(plan.targets?.proteinG) || 0,
      fatG: Number(plan.targets?.fatG) || 0,
      carbG: Number(plan.targets?.carbG) || 0,
      bmi,
      trimester,
    },
    meals,
  };
}

export function extractDishNames(plan) {
  if (!plan?.meals?.length) return [];
  return plan.meals
    .map((m) => m.item?.name || m.name || "")
    .map((n) => String(n).trim())
    .filter(Boolean);
}

export async function generateMealPlan(profile, options = {}) {
  const avoidDishes = Array.isArray(options.avoidDishes)
    ? options.avoidDishes
    : [];
  const avoidThemes = Array.isArray(options.avoidThemes)
    ? options.avoidThemes
    : [];
  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, avoidDishes, avoidThemes }),
    });
  } catch (err) {
    throw new Error(
      `无法连接后端 /api/generate（${err.message}）。请确认已启动 npm run dev。`
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务器返回异常（HTTP ${res.status}）`);
  }

  if (!res.ok) {
    throw new Error(data.error || `生成失败（${res.status}）`);
  }

  const normalized = normalizePlan(data.plan, profile);
  normalized.searchNote = data.searchNote || "";
  normalized.searchProvider = data.searchProvider || null;
  normalized.themes = Array.isArray(data.themes) ? data.themes : [];
  return normalized;
}
