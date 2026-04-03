import { getUserFromId } from "@src/server/service/user-service";
import { PaymentRequiredError } from "./api-utils";

export function isProActive(isProUntil: Date | null | undefined): boolean {
    return !!isProUntil && isProUntil > new Date();
}

export async function requirePro(userId: string): Promise<void> {
    const user = await getUserFromId(userId);
    if (!user || !isProActive(user.isProUntil)) {
        throw new PaymentRequiredError();
    }
}
