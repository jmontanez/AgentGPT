import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

// Accounts and billing are switched on by the Supabase settings. Without them (local UI work,
// HOOKDRAFT_MOCK demos) every request is allowed. In production that would mean unlimited free
// scripts, so the API refuses to run there instead; see requireAccounts() in lib/billing.ts.
export const accountsConfigured = Boolean(url && publishableKey && secretKey);

// Supabase client acting as the signed-in visitor (reads their session cookie).
export async function supabaseForRequest(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url!, publishableKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a place that can't set cookies; middleware.ts refreshes the session instead.
        }
      },
    },
  });
}

// Server-only client with full database access, for usage records and webhook updates.
let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(url!, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export async function currentUser() {
  if (!accountsConfigured) return null;
  const supabase = await supabaseForRequest();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
