export default function GenerateHero({
  profile,
  busy,
  error,
  onGenerate,
  onEditProfile,
}) {
  return (
    <section className="stage">
      <div className="stage-copy">
        <p className="eyebrow">今日营养</p>
        <h1 className="hero-title">一键生成今日食谱</h1>
        <p className="hero-text">
          基于你保存的孕期资料，由 DeepSeek 定制早午晚与加餐安排。
        </p>

        <div className="stage-meta">
          <p>
            当前：孕 {profile.week} 周 · {profile.weight} kg ·{" "}
            {(profile.prefs || []).slice(0, 2).join("、") || "清淡"}
          </p>
          <button type="button" className="text-link" onClick={onEditProfile}>
            调整资料
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <button
          type="button"
          className={`btn-primary btn-xl${busy ? " is-loading" : ""}`}
          disabled={busy}
          onClick={onGenerate}
        >
          <span>{busy ? "DeepSeek 生成中…" : "生成今日食谱"}</span>
        </button>
      </div>

      <div className="stage-visual" aria-hidden="true">
        <div className="stage-plate">
          <div className="plate" />
          <div className="steam steam--1" />
          <div className="steam steam--2" />
          <div className="steam steam--3" />
        </div>
      </div>
    </section>
  );
}
