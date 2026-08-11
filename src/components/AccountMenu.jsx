import { useEffect, useRef, useState } from "react";

export default function AccountMenu({
  email,
  profileLabel,
  loggingOut,
  onEditProfile,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-avatar" aria-hidden="true">
          {(email || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="account-meta">
          <span className="account-email">{email}</span>
          {profileLabel ? (
            <span className="account-sub">{profileLabel}</span>
          ) : (
            <span className="account-sub">完善孕期资料</span>
          )}
        </span>
        <span className="account-caret" aria-hidden="true" />
      </button>

      {open ? (
        <div className="account-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
          >
            编辑孕期资料
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={loggingOut}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            {loggingOut ? "退出中…" : "退出登录"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
