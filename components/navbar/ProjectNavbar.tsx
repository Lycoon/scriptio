"use client";

import { useIsPhone } from "@src/lib/utils/hooks";

import ProjectNavbarDesktop from "./ProjectNavbarDesktop";
import ProjectNavbarMobile from "./ProjectNavbarMobile";

/**
 * Project navbar entry point. A thin dispatcher that picks the phone or the
 * desktop/web layout — the two are separate components ([ProjectNavbarMobile] /
 * [ProjectNavbarDesktop]) sharing their project state through {@link useProjectNavbar}
 * and their status/collaborator pieces through [ProjectNavbarShared], so neither
 * layout carries the other's markup.
 *
 * Branching here (before either sub-component's hooks run) keeps the shared state
 * hook from being instantiated twice.
 */
const ProjectNavbar = () => {
    const isPhone = useIsPhone();
    return isPhone ? <ProjectNavbarMobile /> : <ProjectNavbarDesktop />;
};

export default ProjectNavbar;
