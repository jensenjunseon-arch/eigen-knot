// Supabase auth — magic-link login, shared with the existing (eigen-psy) project.
// URL + anon key are PUBLIC values read from Vite env (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY); per-user data is protected by Row Level Security, not
// by hiding the anon key. If the env is unset the app stays in guest mode and the
// login UI shows a "not configured" hint instead of crashing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseReady: boolean = !!(url && anon);

export const supabase: SupabaseClient | null = supabaseReady
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Send a passwordless magic link. Supabase emails a link that returns to this
// origin; detectSessionInUrl picks up the token. The origin must be added to the
// project's Auth → URL Configuration → Redirect URLs.
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다 (.env의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function currentEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

// Subscribe to login/logout. Returns an unsubscribe fn.
export function onAuthChange(cb: (email: string | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user?.email ?? null));
  return () => data.subscription.unsubscribe();
}
