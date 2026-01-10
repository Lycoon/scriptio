"use client";

import Loading from "@components/utils/Loading";
import DashboardModal from "@components/dashboard/DashboardModal";
import { redirect, useParams } from "next/navigation";
import { ProjectContext, ProjectProvider } from "@src/context/ProjectContext";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { ReactNode, useContext } from "react";
import ProjectNavbar from "@components/navbar/ProjectNavbar";
import { useProjectLock } from "@src/lib/project/project-yjs";

interface ProjectLayoutInnerProps {
    children: ReactNode;
}

const ProjectLayoutInner = ({ children }: ProjectLayoutInnerProps) => {
    const { isYjsReady, isLockedByServer } = useContext(ProjectContext);
    const { membership, isLoading: isMembershipLoading } = useProjectMembership();

    if (isLockedByServer) {
        return <ProjectAlreadyOpenError />;
    }

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

const ProjectAlreadyOpenError = () => {
    return (
        <div className="project-locked-container">
            <div className="project-locked-content">
                <h2>Project Already Open</h2>
                <p>This project is already open in another tab.</p>
                <p>Please close the other tab or use it to continue editing.</p>
                <button onClick={() => window.close()}>Close This Tab</button>
            </div>
        </div>
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
