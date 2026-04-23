import { auth } from "@src/auth";
import AdminShell from "@components/admin/AdminShell";
import ProjectDetail from "@components/admin/ProjectDetail";

type Props = { params: Promise<{ projectId: string }> };

export const generateStaticParams = async () => {
    return [];
};

export default async function AdminProjectDetailPage({ params }: Props) {
    const [session, { projectId }] = await Promise.all([auth(), params]);
    const email = session?.user?.email ?? "";

    return (
        <AdminShell email={email} title="Project detail">
            <ProjectDetail projectId={projectId} />
        </AdminShell>
    );
}
