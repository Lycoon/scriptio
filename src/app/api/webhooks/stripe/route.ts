import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import * as UserService from "@src/server/service/user-service";
import * as TransactionService from "@src/server/service/transaction-service";

export async function POST(req: NextRequest) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const sig = req.headers.get("stripe-signature") ?? "";
    const rawBody = await req.arrayBuffer();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            Buffer.from(rawBody),
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!,
        );
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (userId && session.subscription) {
            const subscriptionId = session.subscription as string;
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const periodEnd = subscription.items.data[0]?.current_period_end;
            await UserService.updateUserFromId(userId, {
                isProUntil: periodEnd ? new Date(periodEnd * 1000) : null,
                subscriptionProvider: "STRIPE",
            });
            await TransactionService.createTransactionIfNotExists(userId, "STRIPE", subscriptionId);
        }
    }

    if (event.type === "customer.subscription.updated") {
        const subscription = event.data.object as Stripe.Subscription;
        const row = await UserService.getUserByStripeSubscriptionId(subscription.id);
        if (row) {
            const periodEnd = subscription.items.data[0]?.current_period_end;
            await UserService.updateUserFromId(row.userId, {
                isProUntil: periodEnd ? new Date(periodEnd * 1000) : null,
                isSubscriptionCancelled: subscription.cancel_at_period_end,
            });
        }
    }

    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const row = await UserService.getUserByStripeSubscriptionId(subscription.id);
        if (row) {
            await UserService.updateUserFromId(row.userId, {
                isProUntil: null,
                isSubscriptionCancelled: false,
                subscriptionProvider: null,
            });
        }
    }

    return NextResponse.json({ received: true });
}
