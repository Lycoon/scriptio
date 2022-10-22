import { NextApiResponse } from "next";
import { useCallback, useContext, useEffect } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../context/UserContext";

export enum VerificationStatus {
    SUCCESS,
    FAILED,
    USED,
}

export enum PasswordRecoverStatus {
    SUCCESS,
    FAILED,
    EXPIRED,
}

export enum Page {
    EXPORT,
    SCREENPLAY,
    STATISTICS,
    EDIT,
}

export const onSuccess = (
    res: NextApiResponse,
    code: number,
    message: string,
    data: any
) => {
    res.status(code).json(onResponse("SUCCESS", message, data));
};

export const onError = (
    res: NextApiResponse,
    code: number,
    message: string
) => {
    res.status(code).json(onResponse("FAILED", message));
};

const onResponse = (status: string, message: string, data?: any) => {
    return {
        status,
        message,
        data,
    };
};

export const setNavbarProject = (project: Project) => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(project), []);
};

export const clearNavbarProject = () => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(undefined), []);
};

export const isValidDelay = (date: Date, minutes: number) => {
    const now = new Date().getTime();
    const last = date.getTime();
    const lastMinutes = (now - last) / 1000 / 60;

    return minutes < lastMinutes;
};

export const getBase64 = async (file: File, width: number, height: number) => {
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return "data:,";
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    let ratio = Math.min(width / img.width, height / img.height);
    ctx?.drawImage(img, 0, 0, img.width * ratio, img.height * ratio);

    return ctx.canvas.toDataURL("image/jpeg") || "data:,";
};
