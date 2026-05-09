"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import ProjectUnavailableDialog from "@components/projects/ProjectUnavailableDialog";
import ProjectMigrationErrorDialog from "@components/projects/ProjectMigrationErrorDialog";
import { redirect, useSearchParams } from "next/navigation";
import { ProjectProvider, useProjectReady } from "@src/context/ProjectContext";
import { ViewProvider } from "@src/context/ViewContext";
import { useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { useLocale } from "@src/context/LocaleContext";
import { useTheme } from "next-themes";
import { ReactNode, Suspense, useEffect } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";
import { isTauri } from "@tauri-apps/api/core";

/**
 * Syncs settings → DOM and settings → locale. Lives here (not root providers)
 * so that /api/users/cookie is never called on the homepage.
 */
function SettingsSync() {
    const { settings } = useSettings();
    const { locale, setLanguage } = useLocale();
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        if (settings?.themedEditor !== undefined)
            document.documentElement.classList.toggle("themed-editor", settings.themedEditor);
        if (settings?.highlightOnHover !== undefined)
            document.documentElement.classList.toggle("highlight-on-hover", settings.highlightOnHover);
    }, [settings?.themedEditor, settings?.highlightOnHover]);

    useEffect(() => {
        if (settings?.language && settings.language !== locale)
            setLanguage(settings.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.language]);

    useEffect(() => {
        if (settings?.theme && settings.theme !== theme)
            setTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.theme]);

    return null;
}

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { status } = useProjectReady();
    const { membership, isLoading: isMembershipLoading, isLocalOnly: isBrowserLocalOnly } = useProjectMembership();

    // Desktop (Tauri) and browser local-only projects skip the cloud membership requirement.
    const isLocalAccess = isTauri() || isBrowserLocalOnly;

    // Surface terminal error states first so the user always gets a clear message,
    // before any redirect or loading gating runs.
    if (status.kind === "needs-update") {
        return <ProjectMigrationErrorDialog outcome={status.outcome} />;
    }
    // The cloud copy is gone (project deleted, or the user was removed). Checked
    // before the redirect so a kicked user with a stale (undefined) membership
    // lands on the dialog instead of being bounced to /projects mid-loop.
    if (status.kind === "unavailable") {
        return <ProjectUnavailableDialog />;
    }
    // Wait for local data and (for cloud projects) for membership to resolve.
    if (status.kind === "loading" || (!isLocalAccess && isMembershipLoading)) {
        return <Loading />;
    }
    // On web, redirect if no cloud membership and not a local project.
    if (!isLocalAccess && !membership) {
        redirect("/projects");
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
            <SettingsSync />
            <ProjectLayoutContent>{children}</ProjectLayoutContent>
        </Suspense>
    );
}
