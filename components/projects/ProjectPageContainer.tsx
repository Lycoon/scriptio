"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { FileDown, Menu, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./CreateProjectPage";
import ProjectItem from "./ProjectItem";
import ProjectNavbarMobileMenu from "../navbar/ProjectNavbarMobileMenu";
import autoAnimate from "@formkit/auto-animate";
import Loading from "../utils/Loading";

import page from "./ProjectPageContainer.module.css";
import form from "../utils/Form.module.css";
import mobileMenu from "../navbar/ProjectNavbarMobileMenu.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

const ProjectPageContainer = () => {
    const { user } = useCookieUser();
    const isPhone = useIsPhone();
    const { isPro } = useIsPro();
    const { projects, isLoading, mutate } = useProjectMemberships();
    const t = useTranslations("projects");
    const tNav = useTranslations("navbar");
    const [isCreating, setIsCreating] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showShadow, setShowShadow] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const parent = useRef(null);

    useEffect(() => {
        if (parent.current) autoAnimate(parent.current);
    }, [parent]);

    const checkOverflow = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const canScroll = el.scrollHeight > el.clientHeight;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
        setShowShadow(canScroll && !isAtBottom);
    }, []);

    useEffect(() => {
        checkOverflow();
        window.addEventListener("resize", checkOverflow);
        return () => window.removeEventListener("resize", checkOverflow);
    }, [checkOverflow, projects]);

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

    if (isLoading || !projects) return <Loading />;

    if (isCreating) {
        return <NewProjectPage setIsCreating={setIsCreating} />;
    } else if (projects.length === 0) {
        return <EmptyProjectPage setIsCreating={setIsCreating} />;
    } else {
        return (
            <div className={page.container}>
                {/* Hidden file input for import */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    accept={getSupportedImportExtensions()}
                    style={{ display: "none" }}
                />
                {/* Phone: the create/import actions move into a slide-in drawer
                    (the same one used inside a project), opened by the burger.
                    Mounted on phone only — an always-present off-screen drawer can
                    add a horizontal scrollbar on desktop. */}
                {isPhone && (
                    <ProjectNavbarMobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)}>
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                setMenuOpen(false);
                                setIsCreating(true);
                            }}
                        >
                            <Plus size={18} />
                            <span>{t("createBtn")}</span>
                        </button>
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                setMenuOpen(false);
                                handleImportClick();
                            }}
                            disabled={isImporting}
                        >
                            <FileDown size={18} />
                            <span>{isImporting ? t("importing") : t("importBtn")}</span>
                        </button>
                    </ProjectNavbarMobileMenu>
                )}
                <div className={page.center}>
                    <div className={page.header}>
                        <div className={page.header_info}>
                            <h1 className={page.header_title}>{t("pageTitle")}</h1>
                            <div className={page.header_btns}>
                                <button
                                    className={`${page.import_btn} ${form.btn}`}
                                    onClick={handleImportClick}
                                    disabled={isImporting}
                                >
                                    <FileDown size={18} />
                                    {isImporting ? t("importing") : t("importBtn")}
                                </button>
                                <button
                                    className={`${page.create_btn} ${form.btn}`}
                                    onClick={() => setIsCreating(true)}
                                >
                                    {t("createBtn")}
                                </button>
                            </div>
                            <div className={page.mobile_menu_btn}>
                                <button
                                    className={navBtn.button}
                                    onClick={() => setMenuOpen(true)}
                                    aria-label={tNav("menu")}
                                >
                                    <Menu size={18} />
                                </button>
                            </div>
                        </div>
                        <hr />
                    </div>
                    <div className={page.gridWrapper}>
                        <div ref={scrollRef} className={page.gridScroll} onScroll={checkOverflow}>
                            <div ref={parent} className={page.grid}>
                                {projects.map((membership: ExtendedProjectMembershipPayload) => {
                                    return (
                                        <ProjectItem
                                            key={membership.project.id}
                                            project={membership.project}
                                            isLocalOnly={membership.isLocalOnly}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                        <div
                            className={join(page.bottomShadow, showShadow ? page.showShadow : "")}
                        />
                    </div>
                </div>
            </div>
        );
    }
};

export default ProjectPageContainer;
