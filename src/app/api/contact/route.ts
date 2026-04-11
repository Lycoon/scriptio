import { apiHandler } from "@src/lib/utils/api-handler";
import { SuccessNoContent, validate } from "@src/lib/utils/api-utils";
import { sendContactEmail } from "@src/lib/mail/mail";
import { NextRequest } from "next/server";
import z from "zod";

const ContactBodySchema = z.object({
    email: z.string().email(),
    reason: z.string(),
    message: z.string(),
});

async function handleContact(req: NextRequest) {
    const body = await req.json();
    const { email, reason, message } = validate(ContactBodySchema, body);

    await sendContactEmail(email, reason, message);

    return SuccessNoContent();
}

export const POST = apiHandler(handleContact);
