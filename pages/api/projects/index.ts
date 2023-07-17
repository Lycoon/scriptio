import { randomUUID } from "crypto";
import { withIronSessionApiRoute } from "iron-session/next";
import { NextApiRequest, NextApiResponse } from "next";
import { MISSING_BODY } from "@src/lib/messages";
import { sessionOptions } from "@src/lib/session";
import { deleteObject, uploadObject } from "@src/lib/s3";
import {
    createProject,
    deleteProject,
    getProjectFromId,
    getProjects,
    updateProject,
} from "@src/server/service/project-service";
import { onResponseAPI } from "@src/lib/utils/requests";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = req.session.user;

    if (!user || !user.isLoggedIn || !user.id) {
        return onResponseAPI(res, 403, "Forbidden");
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
        return onResponseAPI(res, 404, "User with id " + userId + " not found");
    }

    return onResponseAPI(res, 200, "", projects.projects);
}

async function postMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body || !body.title) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    const title: string = body.title;
    const description: string = body.description;

    if (title.length < 2 || title.length > 256) {
        return onResponseAPI(res, 400, "Title must be between 2 and 256 characters");
    }

    if (description && description.length > 2048) {
        return onResponseAPI(res, 400, "Description must be at most 2048-character long");
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
    });

    if (!created) {
        return onResponseAPI(res, 500, "Project creation failed");
    }

    return onResponseAPI(res, 201, "Project created successfully", created);
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    const projectId = body["projectId"];
    const screenplay = body["screenplay"];
    const title: string = body["title"];
    const description = body["description"];
    const characters = body["characters"];

    if (!projectId) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== userId) {
        // not user's project
        return onResponseAPI(res, 403, "Forbidden");
    }

    if (title && (title.length < 2 || title.length > 256)) {
        return onResponseAPI(res, 400, "Title must be between 2 and 256 characters");
    }

    if (description && description.length > 2048) {
        return onResponseAPI(res, 400, "Description must be at most 2048-character long");
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
        return onResponseAPI(res, 500, "Project update failed");
    }

    return onResponseAPI(res, 200, "Project updated successfully", {});
}

async function deleteMethod(userId: number, query: any, res: NextApiResponse) {
    const { projectId } = query;
    if (!projectId) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== userId) {
        // Not user's project
        return onResponseAPI(res, 403, "Forbidden");
    }

    const deleted = await deleteProject({ projectId });
    if (!deleted) {
        return onResponseAPI(res, 500, "Project deletion failed");
    }

    if (project.poster) {
        deleteObject(project.poster);
    }

    return onResponseAPI(res, 200, "Project deleted successfully", deleted);
}
