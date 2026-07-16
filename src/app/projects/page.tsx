"use client";

import { Suspense, useContext, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProjectWorkspace from "@components/project/ProjectWorkspace";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import HomeNavbar from "@components/navbar/HomeNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";
import Loading from "@components/utils/Loading";
import { DashboardContext } from "@src/context/DashboardContext";
import { useIsPhone } from "@src/lib/utils/hooks";

function ProjectsPageContent() {
    const params = useSearchParams();
    const projectId = params.get("projectId");
    const { openDashboard } = useContext(DashboardContext);
    const router = useRouter();
    const isPhone = useIsPhone();

    // The projects sidebar open-state lives here so the navbar burger (in
    // HomeNavbar) and the sidebar itself (in ProjectPageContainer) share it.
    // Desktop: a permanent column (open). Phone: an overlay drawer (starts closed).
    const [sidebarOpen, setSidebarOpen] = useState(!isPhone);

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
                <HomeNavbar onOpenSidebar={() => setSidebarOpen(true)} />
                <ProjectPageContainer sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
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
