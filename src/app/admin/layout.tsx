import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { UserRole } from "../../generated/client/client";
import { auth } from "@src/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth();
    const role = (session?.user as unknown as { role?: UserRole } | undefined)?.role;

    if (!session?.user || role !== UserRole.ADMIN) {
        redirect("/");
    }

    return <>{children}</>;
}
