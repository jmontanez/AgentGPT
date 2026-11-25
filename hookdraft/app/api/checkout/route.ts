import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/http";
import { PRICE_IDS, siteUrl, stripe, TRIAL_DAYS } from "@/lib/stripe";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const CheckoutRequest = z.object({ interval: z.enum(["monthly", "yearly"]) });

// Starts Stripe Checkout for the chosen plan. The card is collected up front; the first
// subscription gets a 7-day trial.
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("Stripe request failed", error);
    return NextResponse.json({ error: "Couldn't reach the payment page. Try again." }, { status: 502 });
  }
}

async function handle(request: Request) {
  const body = await readBody(request, CheckoutRequest);
  if ("response" in body) return body.response;
  const price = PRICE_IDS[body.data.interval];
  if (!process.env.STRIPE_SECRET_KEY || !price) {
    return NextResponse.json({ error: "Payments aren't set up on this server yet." }, { status: 500 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("stripe_customer_id, trial_used, plan").eq("user_id", user.id).maybeSingle();
  if (profile?.plan === "trialing" || profile?.plan === "active") {
    return NextResponse.json({ error: "You're already subscribed." }, { status: 409 });
  }

  let customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    const { error } = await db.from("profiles").upsert({ user_id: user.id, email: user.email, stripe_customer_id: customerId });
    if (error) throw error;
  }

  const site = siteUrl(request);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: profile?.trial_used ? undefined : { trial_period_days: TRIAL_DAYS },
    allow_promotion_codes: true,
    success_url: `${site}/?checkout=success`,
    cancel_url: `${site}/?checkout=canceled`,
  });
  return NextResponse.json({ url: session.url });
}
