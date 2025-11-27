import { randomUUID } from "crypto";
import { NextApiRequest, NextApiResponse } from "next";
import { MISSING_BODY } from "@src/lib/messages";
import { deleteObject, uploadObject } from "@src/lib/s3";
import {
    createProject,
    deleteProject,
    getProjectFromId,
    getProjects,
    updateProject,
} from "@src/server/service/project-service";
import { ResponseAPI } from "@src/lib/utils/requests";
import { getCookieUser } from "@src/lib/session";
import { defaultScreenplay } from "@src/lib/editor/editor";

const MAX_TITLE_LENGTH = 256;
const MAX_DESC_LENGTH = 4096;

export default async function projectsRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        return ResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "GET":
            return getMethod(user.id, res);
        case "POST":
            return postMethod(user.id, req.body, res);
        case "PATCH":
            return patchMethod(user.id, req.body, res);
        case "DELETE":
            return deleteMethod(user.id, req.query, res);
    }
}

async function getMethod(userId: number, res: NextApiResponse) {
    const projects = await getProjects(userId);
    if (!projects) {
        return ResponseAPI(res, 404, "User with id " + userId + " not found");
    }

    return ResponseAPI(res, 200, "", projects.projects);
}

async function postMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body || !body.title) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    const title: string = body.title;
    const description: string = body.description;

    if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
        return ResponseAPI(res, 400, `Title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
    }

    if (description && description.length > MAX_DESC_LENGTH) {
        return ResponseAPI(res, 400, `Description must be at most ${MAX_DESC_LENGTH}-character long`);
    }

    let uuid = undefined;
    if (body.poster) {
        uuid = randomUUID();
        await uploadObject(uuid, body.poster);
    }

    const created = await createProject({
        title,
        description,
        userId,
        poster: uuid,
        screenplay: defaultScreenplay,
    });

    if (!created) {
        return ResponseAPI(res, 500, "Project creation failed");
    }

    return ResponseAPI(res, 201, "Project created successfully", created);
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    const projectId = body["projectId"];
    const screenplay = body["screenplay"];
    const title: string = body["title"];
    const description = body["description"];
    const characters = body["characters"];

    if (!projectId) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== userId) {
        // not user's project
        return ResponseAPI(res, 403, "Forbidden");
    }

    if (title && (title.length < 1 || title.length > MAX_TITLE_LENGTH)) {
        return ResponseAPI(res, 400, `Title must be between 2 and ${MAX_TITLE_LENGTH} characters`);
    }

    if (description && description.length > MAX_DESC_LENGTH) {
        return ResponseAPI(res, 400, `Description must be at most ${MAX_DESC_LENGTH}-character long`);
    }

    let uuid;
    if (body.poster) {
        // Generates uuid if first time uploading, overwrite otherwise
        uuid = project.poster ?? randomUUID();
        await uploadObject(uuid, body.poster);
    }

    const updated = await updateProject({
        projectId,
        screenplay,
        title,
        description,
        characters,
        poster: uuid,
    });

    if (!updated) {
        return ResponseAPI(res, 500, "Project update failed");
    }

    return ResponseAPI(res, 200, "Project updated successfully", {});
}

async function deleteMethod(userId: number, query: any, res: NextApiResponse) {
    const { projectId } = query;
    if (!projectId) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== userId) {
        // Not user's project
        return ResponseAPI(res, 403, "Forbidden");
    }

    const deleted = await deleteProject({ projectId });
    if (!deleted) {
        return ResponseAPI(res, 500, "Project deletion failed");
    }

    if (project.poster) {
        deleteObject(project.poster);
    }

    return ResponseAPI(res, 200, "Project deleted successfully", deleted);
}
