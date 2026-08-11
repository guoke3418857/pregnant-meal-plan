/**
 * 安孕食谱 — 前端
 * 调用后端 /api/generate（本地 server 或 Vercel Serverless）。
 */

const STORAGE_KEY = "pregnant-meal-plan:v2";

function trimesterOf(week) {
  if (week <= 12) return 1;
  if (week <= 27) return 2;
  return 3;
}

function readForm(form) {
  const data = new FormData(form);
  const prefs = [...form.querySelectorAll('input[name="pref"]:checked')].map(
    (el) => el.value
  );
  return {
    apiKey: String(data.get("apiKey") || "").trim(),
    profile: {
      height: Number(data.get("height")),
      weight: Number(data.get("weight")),
      age: Number(data.get("age")),
      week: Number(data.get("week")),
      activity: Number(data.get("activity")),
      avoid: String(data.get("avoid") || "").trim(),
      prefs,
    },
  };
}

function saveDraft(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    /* ignore */
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function setError(message) {
  const el = document.getElementById("form-error");
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setLoading(loading) {
  const btn = document.getElementById("generate-btn");
  const regen = document.getElementById("regen-btn");
  btn.classList.toggle("is-loading", loading);
  btn.disabled = loading;
  regen.disabled = loading;
  btn.querySelector("span").textContent = loading
    ? "DeepSeek 生成中…"
    : "AI 一键生成今日食谱";
}

function normalizePlan(plan, profile) {
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

function renderStats(targets, mealKcal, week) {
  const el = document.getElementById("stats");
  const cards = [
    { label: "建议热量", value: `${targets.calories || "—"}`, unit: "kcal" },
    { label: "食谱合计", value: `${mealKcal || "—"}`, unit: "kcal" },
    { label: "蛋白质", value: `${targets.proteinG || "—"}`, unit: "g" },
    {
      label: "孕期阶段",
      value: `第${targets.trimester}`,
      unit: `期 · ${week}周`,
    },
  ];
  el.innerHTML = cards
    .map(
      (c, i) => `
      <div class="stat" style="animation-delay:${i * 0.05}s">
        <span class="stat-value">${c.value}<small style="font-size:0.7rem;margin-left:2px">${
          c.unit.includes("期") ? "" : c.unit
        }</small></span>
        <span class="stat-label">${c.label}${
          c.unit.includes("期") ? ` · ${c.unit}` : ""
        }</span>
      </div>`
    )
    .join("");
}

function renderMeals(plan) {
  const el = document.getElementById("meals");
  el.innerHTML = plan.meals
    .map(
      (m) => `
      <article class="meal">
        <div class="meal-top">
          <span class="meal-name">${escapeHtml(m.title)}</span>
          <span class="meal-kcal">约 ${m.item.kcal || "—"} kcal</span>
        </div>
        <ul class="meal-items">
          <li>
            <span>${escapeHtml(m.item.name)}</span>
            <span>${escapeHtml(m.item.portion)}</span>
          </li>
        </ul>
        <p class="meal-note">${escapeHtml(m.note)}${
          m.item.tags?.length
            ? ` · 标签：${escapeHtml(m.item.tags.join("、"))}`
            : ""
        }</p>
      </article>`
    )
    .join("");

  if (plan.adjustHint) {
    el.insertAdjacentHTML(
      "beforeend",
      `<p class="meal-note" style="padding:0 4px">${escapeHtml(
        plan.adjustHint
      )}</p>`
    );
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showResult(plan, profile) {
  document.getElementById("empty-hint").hidden = true;
  const result = document.getElementById("result");
  result.hidden = false;

  const t = plan.targets;
  document.getElementById("result-title").textContent =
    `孕${profile.week}周 · BMI ${t.bmi} · 一日食谱`;
  document.getElementById("result-summary").textContent = plan.summary || "";
  document.getElementById("result-eyebrow").textContent = "DeepSeek 生成";

  renderStats(t, plan.mealKcal, profile.week);
  renderMeals(plan);
}

async function generateWithAI({ apiKey, profile }) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, profile }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("服务器返回异常，请确认本地已 npm start，或已部署到 Vercel");
  }

  if (!res.ok) {
    throw new Error(data.error || `生成失败（${res.status}）`);
  }

  return normalizePlan(data.plan, profile);
}

async function runGenerate(form) {
  setError("");
  if (!form.reportValidity()) return;

  const { apiKey, profile } = readForm(form);
  saveDraft({ apiKey, profile });

  setLoading(true);
  try {
    const plan = await generateWithAI({ apiKey, profile });
    showResult(plan, profile);
  } catch (err) {
    setError(err.message || "生成失败，请稍后重试");
  } finally {
    setLoading(false);
  }
}

function restoreDraft(form) {
  const draft = loadDraft();
  if (!draft) return;
  const { apiKey, profile } = draft;
  if (apiKey) {
    form.apiKey.value = apiKey;
    const box = document.getElementById("api-box");
    if (box) box.open = true;
  }
  if (!profile) return;
  form.height.value = profile.height;
  form.weight.value = profile.weight;
  form.age.value = profile.age;
  form.week.value = profile.week;
  form.activity.value = String(profile.activity);
  form.avoid.value = profile.avoid || "";
  form.querySelectorAll('input[name="pref"]').forEach((el) => {
    el.checked = (profile.prefs || []).includes(el.value);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profile-form");
  const keyInput = document.getElementById("api-key");
  const toggle = document.getElementById("toggle-key");

  restoreDraft(form);

  toggle.addEventListener("click", () => {
    const show = keyInput.type === "password";
    keyInput.type = show ? "text" : "password";
    toggle.textContent = show ? "隐藏" : "显示";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runGenerate(form);
  });

  document.getElementById("regen-btn").addEventListener("click", () => {
    runGenerate(form);
  });
});
