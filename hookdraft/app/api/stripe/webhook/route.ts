import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, syncSubscription } from "@/lib/stripe";

export const runtime = "nodejs";

// Stripe calls this whenever a subscription starts, changes, renews or ends.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    console.error("Rejected webhook", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sub = event.data.object.subscription;
        if (sub) await syncSubscription(await stripe().subscriptions.retrieve(typeof sub === "string" ? sub : sub.id));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
    }
  } catch (error) {
    console.error(`Webhook ${event.type} failed`, error);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
