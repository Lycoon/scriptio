import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const adminEmail = process.env.SEED_ADMIN_EMAIL;

    if (!adminEmail) {
        console.log("No SEED_ADMIN_EMAIL set — skipping admin promotion.");
        return;
    }

    const user = await prisma.user.upsert({
        where: { email: adminEmail },
        update: { role: UserRole.ADMIN },
        create: {
            email: adminEmail,
            emailVerified: new Date(),
            role: UserRole.ADMIN,
        },
    });

    console.log(`Admin set: ${user.email} (id: ${user.id})`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
