"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import { redirect, useParams } from "next/navigation";
import { ProjectContext, ProjectProvider } from "@src/context/ProjectContext";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { ReactNode, useContext } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { isYjsReady } = useContext(ProjectContext);
    const { membership, isLoading: isMembershipLoading } = useProjectMembership();

    if (isMembershipLoading || !isYjsReady) {
        return <Loading />;
    }

    if (!membership) {
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

export default function ProjectLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const projectId = params.projectId as string;

    if (!projectId) return null;

    return (
        <ProjectProvider projectId={projectId}>
            <ProjectLayoutInner>{children}</ProjectLayoutInner>
        </ProjectProvider>
    );
}
