export default function MealResult({ plan, profile, onRegen, busy }) {
  if (!plan || !profile) return null;

  const t = plan.targets;
  const cards = [
    { label: "建议热量", value: `${t.calories || "—"}`, unit: "kcal" },
    { label: "食谱合计", value: `${plan.mealKcal || "—"}`, unit: "kcal" },
    { label: "蛋白质", value: `${t.proteinG || "—"}`, unit: "g" },
    {
      label: "孕期阶段",
      value: `第${t.trimester}`,
      unit: `期 · ${profile.week}周`,
    },
  ];

  return (
    <section className="panel panel--result" aria-live="polite">
      <div className="result-head">
        <div>
          <p className="eyebrow">
            {plan.searchNote ? plan.searchNote : "DeepSeek 生成"}
          </p>
          <h2 className="panel-title">
            孕{profile.week}周 · BMI {t.bmi} · 一日食谱
          </h2>
          {plan.summary ? (
            <p className="result-summary">{plan.summary}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={onRegen}
          disabled={busy}
        >
          再生成一组
        </button>
      </div>

      <div className="stats">
        {cards.map((c, i) => (
          <div className="stat" style={{ animationDelay: `${i * 0.05}s` }} key={c.label}>
            <span className="stat-value">
              {c.value}
              {!c.unit.includes("期") ? (
                <small style={{ fontSize: "0.7rem", marginLeft: 2 }}>
                  {c.unit}
                </small>
              ) : null}
            </span>
            <span className="stat-label">
              {c.label}
              {c.unit.includes("期") ? ` · ${c.unit}` : ""}
            </span>
          </div>
        ))}
      </div>

      <div className="meals">
        {plan.meals.map((m) => (
          <article className="meal" key={`${m.title}-${m.item.name}`}>
            <div className="meal-top">
              <span className="meal-name">{m.title}</span>
              <span className="meal-kcal">约 {m.item.kcal || "—"} kcal</span>
            </div>
            <ul className="meal-items">
              <li>
                <span>{m.item.name}</span>
                <span>{m.item.portion}</span>
              </li>
            </ul>
            <p className="meal-note">
              {m.note}
              {m.item.tags?.length ? ` · 标签：${m.item.tags.join("、")}` : ""}
            </p>
          </article>
        ))}
        {plan.adjustHint ? (
          <p className="meal-note" style={{ padding: "0 4px" }}>
            {plan.adjustHint}
          </p>
        ) : null}
      </div>

      <p className="disclaimer">
        本工具由 AI 生成，仅供日常参考，不构成医疗建议。特殊体质、妊娠并发症或医嘱饮食请遵从医生/营养师指导。
      </p>

      {plan.searchDebug ? (
        <details className="search-debug">
          <summary>联网搜索诊断（排查本地有结果 / 远端无结果）</summary>
          <p className="search-debug-summary">{plan.searchDebug.summary}</p>
          <pre className="search-debug-pre">
            {JSON.stringify(plan.searchDebug, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
