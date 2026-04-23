import { auth } from "@src/auth";
import AdminShell from "@components/admin/AdminShell";
import ProjectSearch from "@components/admin/ProjectSearch";

export default async function AdminProjectsPage() {
    const session = await auth();
    const email = session?.user?.email ?? "";

    return (
        <AdminShell email={email} title="Projects" subtitle="Search by title or project ID">
            <ProjectSearch />
        </AdminShell>
    );
}
