"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import EditorAndSidebar from "@components/editor/EditorAndSidebar";
import ProjectUnavailableDialog from "@components/projects/ProjectUnavailableDialog";
import { redirect, useSearchParams } from "next/navigation";
import { ProjectContext, ProjectProvider } from "@src/context/ProjectContext";
import { usePage, useProjectMembership } from "@src/lib/utils/hooks";
import { ReactNode, Suspense, useContext, useEffect, useRef } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";
import { isTauri } from "@tauri-apps/api/core";

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { isYjsReady, isProjectUnavailable } = useContext(ProjectContext);
    const { membership, isLoading: isMembershipLoading } = useProjectMembership();
    const page = usePage();

    const isScreenplay = page === "screenplay";

    // Lazy-init: only mount the editor once the user visits the screenplay page,
    // but keep it alive afterwards so switching back is instant.
    const hasVisitedScreenplay = useRef(false);
    useEffect(() => {
        if (isScreenplay) hasVisitedScreenplay.current = true;
    }, [isScreenplay]);
    const showEditor = hasVisitedScreenplay.current || isScreenplay;

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
        <>
            <ProjectNavbar />
            {/* Editor stays mounted across page transitions to avoid reload/fade.
                Use visibility instead of display:none so TipTap's view stays accessible. */}
            {showEditor && (
                <div
                    style={
                        isScreenplay
                            ? { display: "contents" }
                            : { visibility: "hidden", position: "absolute", pointerEvents: "none" }
                    }
                >
                    <EditorAndSidebar />
                </div>
            )}
            {!isScreenplay && children}
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