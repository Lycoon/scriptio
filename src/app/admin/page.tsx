import { auth } from "@src/auth";
import AdminShell from "@components/admin/AdminShell";
import StatsCards from "@components/admin/StatsCards";

export default async function AdminHomePage() {
    const session = await auth();
    const email = session?.user?.email ?? "";

    return (
        <AdminShell email={email} title="Overview" subtitle="Platform-wide metrics">
            <StatsCards />
        </AdminShell>
    );
}
