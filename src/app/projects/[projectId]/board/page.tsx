import * as ProjectService from "@src/server/service/project-service";
import { Metadata } from "@node_modules/next";
import BoardClientPage from "@components/board/BoardClientPage";

type Props = {
    params: { projectId: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const projectId = (await params).projectId;
    const res = await ProjectService.getProjectTitle(projectId);

    return {
        title: `${res?.title} - Board`,
    };
}

export default function BoardPage() {
    return <BoardClientPage />;
}
