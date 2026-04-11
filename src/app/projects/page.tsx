"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProjectWorkspace from "@components/project/ProjectWorkspace";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import HomeNavbar from "@components/navbar/HomeNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";
import Loading from "@components/utils/Loading";

function ProjectsPageContent() {
    const params = useSearchParams();
    const projectId = params.get("projectId");

    if (!projectId) {
        return (
            <>
                <HomeNavbar />
                <ProjectPageContainer />
                <DashboardModal />
            </>
        );
    }

    return <ProjectWorkspace />;
}

export default function ProjectsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <ProjectsPageContent />
        </Suspense>
    );
}
