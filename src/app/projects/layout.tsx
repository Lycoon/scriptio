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
    const { membership, isLoading: isMembershipLoading } = useProjectMembership();

    // On desktop (Tauri), we support offline-first - don't require API membership
    const isDesktop = isTauri();

    // On web, wait for membership to load
    if (!isDesktop && isMembershipLoading) {
        return <Loading />;
    }

    // Always wait for Yjs to be ready (local or cloud data)
    if (!isYjsReady) {
        return <Loading />;
    }

    // On web, redirect if no membership (unauthorized access)
    if (!isDesktop && !membership) {
        redirect("/");
    }

    // On desktop, show dialog when cloud project is unavailable
    if (isDesktop && isProjectUnavailable) {
        return <ProjectUnavailableDialog />;
    }

    return (
        <ViewProvider>
            <ProjectNavbar />
            {children}
            <DashboardModal />
        </ViewProvider>
    );
};

function ProjectLayoutContent({ children }: { children: ReactNode }) {
    const params = useSearchParams();
    const projectId = params.get("projectId");

    if (!projectId) {
        redirect("/");
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
