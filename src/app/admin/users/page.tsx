import { auth } from "@src/auth";
import AdminShell from "@components/admin/AdminShell";
import UserSearch from "@components/admin/UserSearch";

export default async function AdminUsersPage() {
    const session = await auth();
    const email = session?.user?.email ?? "";

    return (
        <AdminShell email={email} title="Users" subtitle="Search by email or user ID">
            <UserSearch />
        </AdminShell>
    );
}
