import { useState } from "react";

export default function AuthPanel({
  bootHint,
  onLogin,
  onRegister,
  busy,
  error,
}) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isLogin = mode === "login";

  async function handleSubmit(e) {
    e.preventDefault();
    if (isLogin) await onLogin(email, password);
    else await onRegister(email, password);
  }

  return (
    <section className="auth-shell">
      <div className="auth-copy">
        <p className="eyebrow">安孕食谱</p>
        <h1 className="hero-title">为孕期每一天，准备刚好的一餐。</h1>
        <p className="hero-text">
          登录后保存身高、孕周与口味偏好。之后一键生成今日食谱，换设备也能继续用。
        </p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab${isLogin ? " is-active" : ""}`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={`auth-tab${!isLogin ? " is-active" : ""}`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <h2 className="panel-title">{isLogin ? "欢迎回来" : "创建账号"}</h2>
        <p className="panel-desc">使用邮箱即可，资料保存在云端。</p>
        {bootHint ? <p className="form-error">{bootHint}</p> : null}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>邮箱</span>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={6}
              required
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            <span>
              {busy
                ? isLogin
                  ? "登录中…"
                  : "注册中…"
                : isLogin
                  ? "进入安孕食谱"
                  : "注册并继续"}
            </span>
          </button>
        </form>
      </div>
    </section>
  );
}
