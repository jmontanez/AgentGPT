import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase";

export const runtime = "nodejs";

// Where the sign-in email link lands: swap the one-time code for a session cookie, then go home.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (await supabaseForRequest()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/?signedin=1", url.origin));
    console.error("Sign-in link failed", error.message);
  }
  return NextResponse.redirect(new URL("/?signin=failed", url.origin));
}
