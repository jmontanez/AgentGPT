import { NextResponse } from "next/server";
import { siteUrl, stripe } from "@/lib/stripe";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Stripe's hosted page for changing the card, switching plans or cancelling.
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("Stripe request failed", error);
    return NextResponse.json({ error: "Couldn't reach the payment page. Try again." }, { status: 502 });
  }
}

async function handle(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 });
  const { data: profile } = await supabaseAdmin().from("profiles").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
  const session = await stripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: siteUrl(request) });
  return NextResponse.json({ url: session.url });
}
