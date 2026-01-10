"use client";

import { useContext } from "react";
import Loading from "@components/utils/Loading";
import { useCookieUser, useProjectMembership } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import BoardCanvas from "./BoardCanvas";

export default function BoardClientPage() {
    const { user } = useCookieUser(true);
    const { membership, isLoading } = useProjectMembership();
    const { isYjsReady } = useContext(ProjectContext);

    if (!user || !membership || isLoading || !isYjsReady) {
        return <Loading />;
    }

    return <BoardCanvas />;
}
