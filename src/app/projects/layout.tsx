"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import ProjectUnavailableDialog from "@components/projects/ProjectUnavailableDialog";
import { redirect, useSearchParams } from "next/navigation";
import { ProjectProvider, useProjectReady } from "@src/context/ProjectContext";
import { ViewProvider } from "@src/context/ViewContext";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { ReactNode, Suspense } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";
import { isTauri } from "@tauri-apps/api/core";

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { isYjsReady, isProjectUnavailable } = useProjectReady();
    const { membership, isLoading: isMembershipLoading, isLocalOnly: isBrowserLocalOnly } = useProjectMembership();

    // Desktop (Tauri) and browser local-only projects skip the cloud membership requirement
    const isDesktop = isTauri();
    const isLocalAccess = isDesktop || isBrowserLocalOnly;

    // Wait for membership to resolve for potential cloud projects
    if (!isLocalAccess && isMembershipLoading) {
        return <Loading />;
    }

    // Always wait for local data to be ready
    if (!isYjsReady) {
        return <Loading />;
    }

    // On web, redirect if no cloud membership and not a local project
    if (!isLocalAccess && !membership) {
        redirect("/projects");
    }

    // On desktop, show dialog when cloud project is unavailable
    if (isDesktop && isProjectUnavailable) {
        return <ProjectUnavailableDialog />;
    }

    return (
        <ViewProvider>
            <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
                <ProjectNavbar />
                {children}
            </div>
            <DashboardModal />
        </ViewProvider>
    );
};

function ProjectLayoutContent({ children }: { children: ReactNode }) {
    const params = useSearchParams();
    const projectId = params.get("projectId");

    // No projectId: render children directly (projects listing page handles its own UI)
    if (!projectId) {
        return <>{children}</>;
    }

    return (
        <ProjectProvider projectId={projectId}>
            <ProjectLayoutInner>{children}</ProjectLayoutInner>
        </ProjectProvider>
    );
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={<Loading />}>
            <ProjectLayoutContent>{children}</ProjectLayoutContent>
        </Suspense>
    );
}
