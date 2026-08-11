import { isProfileComplete } from "../lib/meal.js";

const PREF_OPTIONS = [
  { value: "少油", label: "少油" },
  { value: "清淡", label: "清淡" },
  { value: "补铁", label: "偏重补铁" },
  { value: "补钙", label: "偏重补钙" },
  { value: "控糖", label: "控糖" },
  { value: "素食友好", label: "素食友好" },
];

const EMPTY = {
  height: 162,
  weight: 58,
  age: 28,
  week: 20,
  activity: 1.375,
  avoid: "",
  prefs: ["清淡"],
};

export default function ProfileModal({
  open,
  profile,
  busy,
  error,
  onClose,
  onSave,
  mode = "edit",
}) {
  if (!open) return null;

  const formProfile = isProfileComplete(profile)
    ? profile
    : { ...EMPTY, ...(profile || {}) };
  const formKey = `${formProfile.height}-${formProfile.weight}-${formProfile.week}-${open}`;
  const isOnboard = mode === "onboard" || !isProfileComplete(profile);

  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const prefs = [
      ...e.currentTarget.querySelectorAll('input[name="pref"]:checked'),
    ].map((el) => el.value);
    onSave({
      height: Number(fd.get("height")),
      weight: Number(fd.get("weight")),
      age: Number(fd.get("age")),
      week: Number(fd.get("week")),
      activity: Number(fd.get("activity")),
      avoid: String(fd.get("avoid") || "").trim(),
      prefs,
    });
  }

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <button type="button" className="modal-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{isOnboard ? "开始使用" : "账户资料"}</p>
            <h2 id="profile-modal-title" className="panel-title">
              {isOnboard ? "完善孕期信息" : "编辑孕期信息"}
            </h2>
            <p className="panel-desc">
              {isOnboard
                ? "只需填写一次，之后生成食谱会自动带上这些信息。"
                : "修改后会同步到云端，下次生成将使用最新资料。"}
            </p>
          </div>
          {!isOnboard ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
              关闭
            </button>
          ) : null}
        </div>

        <form className="form modal-form" onSubmit={handleSubmit} noValidate key={formKey}>
          <div className="field-grid">
            <label className="field">
              <span>身高 (cm)</span>
              <input type="number" name="height" min={140} max={200} step={0.1} required defaultValue={formProfile.height} />
            </label>
            <label className="field">
              <span>当前体重 (kg)</span>
              <input type="number" name="weight" min={35} max={150} step={0.1} required defaultValue={formProfile.weight} />
            </label>
            <label className="field">
              <span>年龄</span>
              <input type="number" name="age" min={18} max={50} required defaultValue={formProfile.age} />
            </label>
            <label className="field">
              <span>孕周</span>
              <input type="number" name="week" min={1} max={42} required defaultValue={formProfile.week} />
            </label>
          </div>

          <label className="field">
            <span>活动量</span>
            <select name="activity" defaultValue={String(formProfile.activity)}>
              <option value="1.2">久坐为主（少运动）</option>
              <option value="1.375">轻度活动（日常走动）</option>
              <option value="1.55">中度活动（规律散步/瑜伽）</option>
            </select>
          </label>

          <fieldset className="fieldset">
            <legend>饮食偏好</legend>
            <div className="pref-list">
              {PREF_OPTIONS.map((p) => (
                <label className="pref-item" key={p.value}>
                  <input
                    type="checkbox"
                    name="pref"
                    value={p.value}
                    defaultChecked={(formProfile.prefs || []).includes(p.value)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>忌口 / 过敏（可选）</span>
            <input
              type="text"
              name="avoid"
              placeholder="例如：海鲜、牛奶、花生"
              defaultValue={formProfile.avoid || ""}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions">
            {!isOnboard ? (
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                取消
              </button>
            ) : null}
            <button type="submit" className={`btn-primary${busy ? " is-loading" : ""}`} disabled={busy}>
              <span>{busy ? "保存中…" : isOnboard ? "保存并开始" : "保存资料"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
