import { useCallback, useEffect, useRef, useState } from "react";
import AuthPanel from "./components/AuthPanel.jsx";
import AccountMenu from "./components/AccountMenu.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
import GenerateHero from "./components/GenerateHero.jsx";
import MealResult from "./components/MealResult.jsx";
import { createSupabase, loadPublicConfig } from "./lib/supabase.js";
import {
  extractDishNames,
  generateMealPlan,
  isProfileComplete,
  profileFromRow,
} from "./lib/meal.js";

function clearSupabaseAuthStorage() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-") && key.includes("auth")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [bootHint, setBootHint] = useState("正在连接登录服务…");
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [quickError, setQuickError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planProfile, setPlanProfile] = useState(null);
  const ignoringAuthRef = useRef(false);

  const loadProfile = useCallback(async (client, currentUser) => {
    if (!client || !currentUser) {
      setProfile(null);
      return;
    }
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (error) throw new Error(error.message || "读取资料失败");
    const next = profileFromRow(data);
    setProfile(next);
    setEditing(!isProfileComplete(next));
  }, []);

  const applySession = useCallback(
    async (client, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setAuthError("");
      setFormError("");
      setQuickError("");
      if (!nextUser) {
        setProfile(null);
        setEditing(false);
        setPlan(null);
        setPlanProfile(null);
        return;
      }
      try {
        await loadProfile(client, nextUser);
      } catch (err) {
        setFormError(err.message || "加载资料失败");
      }
    },
    [loadProfile]
  );

  useEffect(() => {
    let cancelled = false;
    let subscription;

    (async () => {
      try {
        const cfg = await loadPublicConfig();
        if (cancelled) return;
        if (!cfg.configured) {
          setBootHint("");
          setAuthError(
            "未配置 Supabase。请在 .env 设置 SUPABASE_URL、SUPABASE_ANON_KEY，并执行 supabase/schema.sql。"
          );
          return;
        }
        const client = createSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
        if (cancelled) return;
        setSupabase(client);
        setBootHint("");

        const { data, error } = await client.auth.getSession();
        if (error) setAuthError(error.message || "读取登录状态失败");
        if (!ignoringAuthRef.current) {
          await applySession(client, data?.session || null);
        }

        const { data: sub } = client.auth.onAuthStateChange(
          async (event, session) => {
            if (ignoringAuthRef.current) {
              if (event === "SIGNED_OUT" || !session) {
                ignoringAuthRef.current = false;
                await applySession(client, null);
              }
              return;
            }
            await applySession(client, session);
          }
        );
        subscription = sub.subscription;
      } catch (err) {
        if (!cancelled) {
          setBootHint("");
          setAuthError(err.message || "初始化失败");
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, [applySession]);

  async function handleLogin(email, password) {
    if (!supabase) {
      setAuthError("Supabase 未就绪");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(err.message || "登录失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(email, password) {
    if (!supabase) {
      setAuthError("Supabase 未就绪");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        setAuthError(
          "注册成功。若开启了邮箱确认，请先到邮箱点开确认链接后再登录。"
        );
      }
    } catch (err) {
      setAuthError(err.message || "注册失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (loggingOut) return;

    setLoggingOut(true);
    ignoringAuthRef.current = true;
    setUser(null);
    setProfile(null);
    setEditing(false);
    setPlan(null);
    setPlanProfile(null);
    setAuthError("");

    try {
      if (supabase) {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }
    } catch (err) {
      console.warn("signOut error", err);
    } finally {
      clearSupabaseAuthStorage();
      ignoringAuthRef.current = false;
      setLoggingOut(false);
    }
  }

  async function upsertProfile(nextProfile) {
    if (!supabase || !user) throw new Error("请先登录");
    const payload = {
      user_id: user.id,
      height: nextProfile.height,
      weight: nextProfile.weight,
      age: nextProfile.age,
      week: nextProfile.week,
      activity: nextProfile.activity,
      prefs: nextProfile.prefs || [],
      avoid: nextProfile.avoid || "",
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message || "保存资料失败");
    const saved = profileFromRow(data);
    setProfile(saved);
    setEditing(false);
    return saved;
  }

  async function handleSaveProfile(nextProfile) {
    setFormError("");
    setBusy(true);
    const firstTime = !isProfileComplete(profile);
    try {
      const saved = await upsertProfile(nextProfile);
      if (firstTime) {
        const result = await generateMealPlan(saved);
        setPlan(result);
        setPlanProfile(saved);
      }
    } catch (err) {
      setFormError(err.message || "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickGenerate({ avoidPrevious = false } = {}) {
    setQuickError("");
    if (!isProfileComplete(profile)) {
      setQuickError("请先完善孕期资料");
      setEditing(true);
      return;
    }
    setBusy(true);
    try {
      const avoidDishes =
        avoidPrevious && plan ? extractDishNames(plan) : [];
      const avoidThemes =
        avoidPrevious && plan?.themes?.length ? plan.themes : [];
      const result = await generateMealPlan(profile, {
        avoidDishes,
        avoidThemes,
      });
      setPlan(result);
      setPlanProfile(profile);
    } catch (err) {
      setQuickError(err.message || "生成失败");
    } finally {
      setBusy(false);
    }
  }

  const ready = isProfileComplete(profile);
  const showProfileModal = Boolean(user) && (editing || !ready);

  return (
    <>
      <div className="bg-orb bg-orb--a" aria-hidden="true" />
      <div className="bg-orb bg-orb--b" aria-hidden="true" />

      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">安孕食谱</span>
        </div>
        {user ? (
          <AccountMenu
            email={user.email}
            profileLabel={ready ? `孕${profile.week}周` : ""}
            loggingOut={loggingOut}
            onEditProfile={() => {
              setFormError("");
              setEditing(true);
            }}
            onLogout={handleLogout}
          />
        ) : (
          <p className="header-note">按身体数据定制每日一餐</p>
        )}
      </header>

      <main className="site-main">
        {!user ? (
          <AuthPanel
            bootHint={bootHint}
            onLogin={handleLogin}
            onRegister={handleRegister}
            busy={authBusy}
            error={authError}
          />
        ) : ready ? (
          <>
            <GenerateHero
              profile={profile}
              busy={busy}
              error={quickError}
              onGenerate={() => handleQuickGenerate({ avoidPrevious: false })}
              onEditProfile={() => {
                setFormError("");
                setEditing(true);
              }}
            />
            {plan && planProfile ? (
              <MealResult
                plan={plan}
                profile={planProfile}
                busy={busy}
                onRegen={() => handleQuickGenerate({ avoidPrevious: true })}
              />
            ) : null}
          </>
        ) : (
          <section className="onboard-placeholder">
            <p className="eyebrow">欢迎</p>
            <h1 className="hero-title">先完善一次孕期资料</h1>
            <p className="hero-text">资料会保存在云端，之后生成食谱不必重复填写。</p>
          </section>
        )}
      </main>

      <ProfileModal
        open={showProfileModal}
        profile={profile}
        busy={busy}
        error={formError}
        mode={ready ? "edit" : "onboard"}
        onClose={() => {
          if (!ready) return;
          setEditing(false);
          setFormError("");
        }}
        onSave={handleSaveProfile}
      />

      <footer className="footer">
        <span>安孕食谱</span>
        <span>资料云端保存 · AI 仅供参考</span>
      </footer>
    </>
  );
}
