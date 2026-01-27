"use client";

import Loading from "@components/utils/Loading";
import { useProjectMembership } from "@src/lib/utils/hooks";
import BoardCanvas from "./BoardCanvas";
import { isTauri } from "@node_modules/@tauri-apps/api/core";

export default function BoardClientPage() {
    const { membership, isLoading } = useProjectMembership();

    if (!isTauri() && (!membership || isLoading)) return <Loading />;

    return <BoardCanvas />;
}
