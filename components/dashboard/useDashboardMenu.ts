"use client";

import { createElement, useContext, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
    CreditCard,
    FileDown,
    Folder,
    Globe,
    HardDrive,
    Keyboard,
    Lock,
    Palette,
    PanelsTopLeft,
    User,
    Users,
} from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser, useIsPhone } from "@src/lib/utils/hooks";
import type { MenuSection } from "./DashboardSidebar";

/**
 * The dashboard's navigation structure, shared between the desktop sidebar
 * ([DashboardModal]) and the phone burger menu ([ProjectNavbar]) so the two
 * never drift. Sections are gated the same way the modal renders their content:
 * project tabs only in a project, account tabs only when signed in.
 */
export const useDashboardMenu = () => {
    const t = useTranslations("modal");
    const { project, isYjsReady } = useContext(ProjectContext);
    const { user, isLoading: isUserLoading } = useCookieUser();
    const isPhone = useIsPhone();

    const projectMenu = useMemo<MenuSection>(
        () => ({
            group: t("groups.project"),
            items: [
                { id: "General", label: t("tabs.General"), icon: createElement(Folder, { size: 18 }) },
                { id: "Layout", label: t("tabs.Layout"), icon: createElement(PanelsTopLeft, { size: 18 }) },
                { id: "Production", label: t("tabs.Production"), icon: createElement(Lock, { size: 18 }) },
                { id: "Export", label: t("tabs.Export"), icon: createElement(FileDown, { size: 18 }) },
                { id: "Storage", label: t("tabs.Storage"), icon: createElement(HardDrive, { size: 18 }) },
                { id: "Collaborators", label: t("tabs.Collaborators"), icon: createElement(Users, { size: 18 }) },
            ],
        }),
        [t],
    );

    // Keybinds is a hardware-keyboard rebinding UI — capture needs real modifier
    // keys, and the combos only ever fire from a physical keyboard. Phones can't
    // produce either, so the tab is hidden there. Tablets keep it: an iPad with a
    // keyboard case is a normal target, and it already gets the desktop layout.
    const preferencesMenu = useMemo<MenuSection>(
        () => ({
            group: t("groups.preferences"),
            items: [
                ...(isPhone
                    ? []
                    : [{ id: "Keybinds" as const, label: t("tabs.Keybinds"), icon: createElement(Keyboard, { size: 18 }) }]),
                { id: "Appearance", label: t("tabs.Appearance"), icon: createElement(Palette, { size: 18 }) },
                { id: "Language", label: t("tabs.Language"), icon: createElement(Globe, { size: 18 }) },
            ],
        }),
        [t, isPhone],
    );

    const accountMenu = useMemo<MenuSection>(
        () => ({
            group: t("groups.account"),
            items: [
                { id: "Profile", label: t("tabs.Profile"), icon: createElement(User, { size: 18 }) },
                { id: "Subscription", label: t("tabs.Subscription"), icon: createElement(CreditCard, { size: 18 }) },
            ],
        }),
        [t],
    );

    // We're in a project if either API membership exists (cloud) or Yjs is ready
    // (local project on desktop without auth).
    const isInProject = project !== null || isYjsReady;
    const isSignedIn = !!user;

    const structure = useMemo<MenuSection[]>(() => {
        const sections: MenuSection[] = [];
        if (isInProject) sections.push(projectMenu);
        sections.push(preferencesMenu);
        if (isSignedIn) sections.push(accountMenu);
        return sections;
    }, [isInProject, isSignedIn, projectMenu, preferencesMenu, accountMenu]);

    return { structure, projectMenu, preferencesMenu, accountMenu, isInProject, isSignedIn, isUserLoading };
};
