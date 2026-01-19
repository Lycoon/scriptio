import EditorAndSidebar from "@components/editor/EditorAndSidebar";
import * as ProjectService from "@src/server/service/project-service";
import { Metadata } from "next";

type Props = {
    params: { projectId: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const projectId = (await params).projectId;
    const res = await ProjectService.getProjectTitle(projectId);

    return {
        title: `${res?.title}`,
    };
}

export default function ScreenplayPage() {
    return <EditorAndSidebar />;
}
