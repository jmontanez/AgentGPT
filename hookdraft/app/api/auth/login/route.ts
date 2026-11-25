import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/http";
import { siteUrl } from "@/lib/stripe";
import { accountsConfigured, supabaseForRequest } from "@/lib/supabase";

export const runtime = "nodejs";

const LoginRequest = z.object({ email: z.email("Enter a valid email address.") });

// Emails a one-tap sign-in link. No passwords.
export async function POST(request: Request) {
  if (!accountsConfigured) return NextResponse.json({ error: "Sign-in isn't set up on this server." }, { status: 500 });
  const body = await readBody(request, LoginRequest);
  if ("response" in body) return body.response;
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.signInWithOtp({
    email: body.data.email,
    options: { emailRedirectTo: `${siteUrl(request)}/auth/callback` },
  });
  if (error) {
    console.error("Sign-in email failed", error.message);
    const status = error.status === 429 ? 429 : 500;
    return NextResponse.json({ error: status === 429 ? "Too many sign-in emails. Wait a minute and try again." : "Couldn't send the sign-in email. Try again." }, { status });
  }
  return NextResponse.json({ ok: true });
}
