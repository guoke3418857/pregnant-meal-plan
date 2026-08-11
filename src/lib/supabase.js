import { createClient } from "@supabase/supabase-js";

export async function loadPublicConfig() {
  const res = await fetch("/api/public-config");
  if (!res.ok) {
    throw new Error("无法读取 /api/public-config，请确认后端已启动");
  }
  return res.json();
}

export function createSupabase(url, anonKey) {
  return createClient(url, anonKey);
}
