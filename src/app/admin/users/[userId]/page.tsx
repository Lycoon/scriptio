import { auth } from "@src/auth";
import AdminShell from "@components/admin/AdminShell";
import UserDetail from "@components/admin/UserDetail";

type Props = { params: Promise<{ userId: string }> };

export default async function AdminUserDetailPage({ params }: Props) {
    const session = await auth();
    const email = session?.user?.email ?? "";
    const { userId } = await params;

    return (
        <AdminShell email={email} title="User detail">
            <UserDetail userId={userId} />
        </AdminShell>
    );
}
