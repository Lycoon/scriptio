"use client";

import { Suspense, useContext, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProjectWorkspace from "@components/project/ProjectWorkspace";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import HomeNavbar from "@components/navbar/HomeNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";
import Loading from "@components/utils/Loading";
import { DashboardContext } from "@src/context/DashboardContext";

function ProjectsPageContent() {
    const params = useSearchParams();
    const projectId = params.get("projectId");
    const { openDashboard } = useContext(DashboardContext);
    const router = useRouter();

    useEffect(() => {
        if (!projectId && params.get("pro") === "success") {
            sessionStorage.setItem("proWelcome", "1");
            router.replace("/projects");
            openDashboard("Subscription");
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
