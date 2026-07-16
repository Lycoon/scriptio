"use client";

import { useEffect, useRef, useState } from "react";
import {
    useCookieUser,
    useIsPhone,
    useIsPro,
    useProjectMemberships,
    ExtendedProjectMembershipPayload,
} from "@src/lib/utils/hooks";
import { join } from "@src/lib/utils/misc";
import { importFileAsProject, getSupportedImportExtensions } from "@src/lib/import/import-project";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { FileDown, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./CreateProjectPage";
import ProjectItem from "./ProjectItem";
import autoAnimate from "@formkit/auto-animate";
import Loading from "../utils/Loading";

import Logo from "@public/images/scriptio.svg";

import page from "./ProjectPageContainer.module.css";

interface ProjectPageContainerProps {
    // Sidebar drawer state is owned by the page so the navbar burger can open it.
    // Desktop: a permanent column (open). Phone: an overlay drawer toggled here.
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
}

const ProjectPageContainer = ({ sidebarOpen, setSidebarOpen }: ProjectPageContainerProps) => {
    const { user } = useCookieUser();
    const isPhone = useIsPhone();
    const { isPro } = useIsPro();
    const { projects, isLoading, mutate } = useProjectMemberships();
    const t = useTranslations("projects");
    const tNav = useTranslations("navbar");
    const [isCreating, setIsCreating] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const parent = useRef(null);

    useEffect(() => {
        if (parent.current) autoAnimate(parent.current);
    }, [parent]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            // This now correctly preserves all project data (title page, board, etc.)
            const result = await importFileAsProject(file, user, undefined, isPro);

            if (result.success && result.projectId) {
                // Refresh the project list
                await mutate();
                // Redirect to the new project
                redirectScreenplay(result.projectId);
            } else {
                console.error("Import failed:", result.error);
                // Could show a toast/notification here
            }
        } catch (error) {
            console.error("Import error:", error);
        } finally {
            setIsImporting(false);
            // Reset input so the same file can be selected again
            event.target.value = "";
        }
    };

    const startCreating = () => {
        if (isPhone) setSidebarOpen(false);
        setIsCreating(true);
    };

    const startImport = () => {
        if (isPhone) setSidebarOpen(false);
        handleImportClick();
    };

    if (isLoading || !projects) return <Loading />;

    const renderMain = () => {
        if (isCreating) {
            return <NewProjectPage setIsCreating={setIsCreating} />;
        }
        if (projects.length === 0) {
            return (
                <EmptyProjectPage
                    onCreate={startCreating}
                    onImport={startImport}
                    isImporting={isImporting}
                />
            );
        }
        return (
            <div className={page.list}>
                <div className={page.list_header}>
                    <span className={page.col_poster} aria-hidden />
                    <span className={page.col_title}>{t("columns.title")}</span>
                    <span className={page.col_date}>{t("columns.lastEdited")}</span>
                    <span className={page.col_storage}>{t("columns.storage")}</span>
                </div>
                <div className={page.list_scroll}>
                    <div ref={parent} className={page.rows}>
                        {projects.map((membership: ExtendedProjectMembershipPayload) => (
                            <ProjectItem
                                key={membership.project.id}
                                project={membership.project}
                                isLocalOnly={membership.isLocalOnly}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={page.layout}>
            {/* Hidden file input for import — shared by the sidebar and empty state. */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept={getSupportedImportExtensions()}
                style={{ display: "none" }}
            />

            {/* Phone: dim + dismiss layer behind the open drawer. */}
            {isPhone && sidebarOpen && (
                <div className={page.backdrop} onClick={() => setSidebarOpen(false)} />
            )}

            <aside className={join(page.sidebar, !sidebarOpen ? page.sidebar_closed : "")}>
                <div className={page.sidebar_top}>
                    <Logo className={page.logo} />
                    {isPhone && (
                        <button
                            className={page.sidebar_close}
                            onClick={() => setSidebarOpen(false)}
                            aria-label={tNav("close")}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
                <div className={page.sidebar_actions}>
                    <button
                        className={join(page.action_btn, page.action_primary)}
                        onClick={startCreating}
                    >
                        <Plus size={16} />
                        <span>{t("createBtn")}</span>
                    </button>
                    <button
                        className={page.action_btn}
                        onClick={startImport}
                        disabled={isImporting}
                    >
                        <FileDown size={16} />
                        <span>{isImporting ? t("importing") : t("importBtn")}</span>
                    </button>
                </div>
            </aside>

            <main className={page.main}>
                {renderMain()}
            </main>
        </div>
    );
};

export default ProjectPageContainer;
