"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import debounce from "debounce";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { useCookieUser, useIsPro, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { useDashboardMenu } from "@components/dashboard/useDashboardMenu";
import { editProject } from "@src/lib/utils/requests";
import { redirectHome } from "@src/lib/utils/redirects";
import { signOutAccount } from "@src/lib/utils/auth-actions";

/**
 * State and actions the desktop bar ([ProjectNavbar]) and the phone bar
 * ([ProjectNavbarMobile]) both need: the project title (with its debounced
 * persistence), whether the project is local-only / cloud-uploadable, the shared
 * dashboard menu, and the back/sign-out actions. Owning it in one hook keeps the
 * two layouts free of duplicated effects and guarantees they stay in sync.
 */
export const useProjectNavbar = () => {
    const { openDashboard, mobileMenuOpen, setMobileMenuOpen } = useContext(DashboardContext);
    const { project: membership, setProjectTitle: setContextTitle } = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { isPro } = useIsPro();
    const { user } = useCookieUser();
    const projectId = useProjectIdFromUrl();
    const { structure: dashboardMenu, isSignedIn } = useDashboardMenu();

    const [projectTitle, setProjectTitle] = useState<string>("");
    const [isLocalOnly, setIsLocalOnly] = useState<boolean | null>(null);
    const isLocalEdit = useRef(false);

    const isInProject = !!projectId;
    const canUploadToCloud = !membership && !!user && isPro && !!projectId && isLocalOnly === true;

    const deferredTitleUpdate = useMemo(
        () =>
            debounce(async (projectId: string, newTitle: string) => {
                const { isLocalOnlyProject, updateCachedProject } =
                    await import("@src/lib/persistence/storage-provider/local-persistence");
                if (await isLocalOnlyProject(projectId)) {
                    await updateCachedProject(projectId, { title: newTitle });
                } else {
                    await editProject(projectId, { title: newTitle });
                    await updateCachedProject(projectId, { title: newTitle });
                }
            }, 1000),
        [],
    );

    // Resolve whether the open project lives only on this device (drives the
    // cloud-upload affordance and the local-project status glyph).
    useEffect(() => {
        if (!projectId) {
            setIsLocalOnly(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const { isLocalOnlyProject, cachedProjectExists } =
                await import("@src/lib/persistence/storage-provider/local-persistence");
            const exists = await cachedProjectExists(projectId);
            const local = exists ? await isLocalOnlyProject(projectId) : false;
            if (!cancelled) setIsLocalOnly(local);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, membership]);

    // Load the project title from membership (cloud) or local storage.
    useEffect(() => {
        if (membership && !isLocalEdit.current) {
            setProjectTitle(membership.project.title);
            return;
        }

        if (projectId && !membership) {
            const loadLocalTitle = async () => {
                const { isCachedProject, getCachedProject } =
                    await import("@src/lib/persistence/storage-provider/local-persistence");
                if (await isCachedProject(projectId)) {
                    const cachedProject = await getCachedProject(projectId);
                    if (cachedProject && !isLocalEdit.current) {
                        setProjectTitle(cachedProject.title);
                    }
                }
            };
            loadLocalTitle();
        }
    }, [membership, projectId]);

    // Mirror the project title into the browser tab.
    useEffect(() => {
        if (projectTitle && isInProject) {
            document.title = `${projectTitle}`;
        }
    }, [projectTitle, isInProject]);

    const onTitleChange = (value: string) => {
        if (!projectId) return;
        isLocalEdit.current = true;
        setProjectTitle(value);
        setContextTitle(value);
        deferredTitleUpdate(projectId, value);
    };
    const onTitleBlur = () => {
        isLocalEdit.current = false;
    };

    // Return to the projects list. redirectHome() swaps out the ?projectId query
    // the same way opening a project does, which the Tauri static export needs
    // (a bare router.replace doesn't reliably re-render the layout back).
    const backToProjects = () => redirectHome();

    // Sign out via the shared flow, then land on the home/landing screen.
    const onSignOut = async () => {
        await signOutAccount();
        redirectHome();
    };

    return {
        openDashboard,
        mobileMenuOpen,
        setMobileMenuOpen,
        membership,
        userCtx,
        isPro,
        user,
        projectId,
        isInProject,
        canUploadToCloud,
        dashboardMenu,
        isSignedIn,
        projectTitle,
        onTitleChange,
        onTitleBlur,
        backToProjects,
        onSignOut,
    };
};
