import { NextRequest } from "next/server";
import z from "zod";

import * as UserService from "@src/server/service/user-service";
import * as ProjectService from "@src/server/service/project-service";
import { Success, UserNotFoundError, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const ParamsSchema = z.object({ userId: z.string().min(1) });

async function getUserDetail(req: NextRequest, { routeParams, user }: AuthApiContext) {
    await assertAdmin(user);
    const { userId } = validate(ParamsSchema, routeParams);

    const target = await UserService.getUserFromId(userId);
    if (!target) throw new UserNotFoundError();

    const [projectCount, { stripeCustomerId }] = await Promise.all([
        ProjectService.countMembershipsByUser(userId),
        UserService.getStripeIds(userId),
    ]);

    // Billing history lives in Stripe; hand the admin a deep link instead of
    // mirroring it. Test-mode keys open the test-mode dashboard.
    const dashboardBase = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
        ? "https://dashboard.stripe.com/test"
        : "https://dashboard.stripe.com";

    return Success({
        user: {
            id: target.id,
            email: target.email,
            createdAt: target.createdAt,
            emailVerified: target.emailVerified,
            username: target.username,
            role: target.role,
            isProUntil: target.isProUntil,
            isSubscriptionCancelled: target.isSubscriptionCancelled,
            stripeCustomerId,
            stripeCustomerUrl: stripeCustomerId ? `${dashboardBase}/customers/${stripeCustomerId}` : null,
        },
        projectCount,
    });
}

export const GET = apiHandler(getUserDetail);
