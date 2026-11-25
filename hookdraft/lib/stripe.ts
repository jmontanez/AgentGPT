import Stripe from "stripe";
import { supabaseAdmin } from "./supabase";

export const TRIAL_DAYS = 7;

let client: Stripe | null = null;
export function stripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
} as const;
export type Interval = keyof typeof PRICE_IDS;

export function siteUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

// Mirror a Stripe subscription onto the user's profile. Called from the webhook.
export async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  // Newer Stripe API versions keep the billing period on each subscription item.
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const plan = subscription.status === "canceled" ? "free" : subscription.status;

  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({
      plan,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      trial_used: true,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}
