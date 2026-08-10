"use client";

import { Suspense, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProjectWorkspace from "@components/project/ProjectWorkspace";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import HomeNavbar from "@components/navbar/HomeNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";
import Loading from "@components/utils/Loading";
import { DashboardContext } from "@src/context/DashboardContext";
import { useAppNavigation } from "@src/lib/utils/navigation";

function ProjectsPageContent() {
    const params = useSearchParams();
    const projectId = params.get("projectId");
    const { openDashboard } = useContext(DashboardContext);
    const { goToProjects } = useAppNavigation();

    // The projects sidebar open-state lives here so the navbar burger (in
    // HomeNavbar) and the sidebar itself (in ProjectPageContainer) share it.
    // Start closed: on desktop the sidebar is a permanent column shown by CSS
    // regardless of this flag (the closed-transform is phone-only), so this only
    // governs the phone drawer, which should begin closed. Deriving it from
    // `isPhone` instead would depend on a value that's false until after mount
    // (see useIsPhone) and would leave the phone drawer open on load.
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!projectId && params.get("pro") === "success") {
            sessionStorage.setItem("proWelcome", "1");
            goToProjects();
            openDashboard("Subscription");
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!projectId) {
        return (
            <>
                <HomeNavbar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
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
