"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import { redirect, useParams, useSearchParams } from "next/navigation";
import { ProjectContext, ProjectProvider } from "@src/context/ProjectContext";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { ReactNode, Suspense, useContext } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";
import { isTauri } from "@tauri-apps/api/core";

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { isYjsReady } = useContext(ProjectContext);
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

    return (
        <>
            <ProjectNavbar />
            {children}
            <DashboardModal />
        </>
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