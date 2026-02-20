"use client";

import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { cropImageBase64, join } from "@src/lib/utils/misc";
import { FormInfoType } from "../utils/FormInfo";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { createProject } from "@src/lib/utils/requests";
import { useCookieUser } from "@src/lib/utils/hooks";
import UploadButton from "./UploadButton";
import FormHeader from "./FormHeader";
import FormEnd from "./FormEnd";

import form from "../utils/Form.module.css";
import layout from "../utils/Layout.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { CreateProjectBody } from "@src/lib/utils/api-bodies";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const CreateProjectPage = ({ setIsCreating }: Props) => {
    const { user } = useCookieUser();

    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const exitCreating = () => {
        setIsCreating(false);
    };

    const resetFormInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();
        resetFormInfo();

        const title = e.target.title.value;
        const description = e.target.description.value;
        const author = e.target.author.value;

        // Desktop: offline-first project creation
        // Always create locally. If signed in, try cloud first to use its ID.
        if (isTauri()) {
            let projectId: string | null = null;
            try {
                // If signed in, try creating on server to get the cloud project ID
                if (user) {
                    try {
                        const body: CreateProjectBody = { title, description, author };
                        if (selectedFile) {
                            body.poster = await cropImageBase64(selectedFile, 686, 1016);
                        }
                        const res = await createProject(user.id, body);
                        const json = (await res.json()) as ApiResponse;
                        if (res.ok) {
                            projectId = json.data.id;
                        }
                    } catch {
                        // Server unreachable - will generate a local ID below
                    }
                }

                // Always create local SQLite entry, using the cloud ID if available
                const { createLocalProject, createLocalProjectWithId } = await import(
                    "@src/lib/persistence/local-projects"
                );
                if (projectId) {
                    await createLocalProjectWithId(projectId, title, description, true, author);
                } else {
                    const localProject = await createLocalProject(title, description, author);
                    projectId = localProject.id;
                }
            } catch (error) {
                console.log("Failed to create project:", error);
                setFormInfo({ content: "Failed to create project", isError: true });
            }
            // Redirect outside try-catch since Next.js redirect() throws NEXT_REDIRECT
            if (projectId) {
                redirectScreenplay(projectId);
            }
            return;
        }

        // Web: create via API
        if (!user) return;

        const body: CreateProjectBody = {
            title,
            description,
            author,
        };

        if (selectedFile) {
            body.poster = await cropImageBase64(selectedFile, 686, 1016);
        }

        const res = await createProject(user.id, body);
        const json = (await res.json()) as ApiResponse;
        if (!res.ok) {
            setFormInfo({ content: json.message!, isError: true });
            return;
        }

        const projectId = json.data.id;
        redirectScreenplay(projectId);
    };

    return (
        <div className={layout.center_row}>
            <form className={form.container} onSubmit={onSubmit}>
                <FormHeader title={"Create project"} formInfo={formInfo} />

                <div className={form.elements}>
                    <div className={form.element}>
                        <p className={form.label}>Title</p>
                        <input name="title" className={form.input} onChange={resetFormInfo} required />
                    </div>
                    <div className={form.element}>
                        <p className={form.label}>
                            Description - <i>optional</i>
                        </p>
                        <textarea
                            name="description"
                            className={join(form.input, form.input_desc)}
                            onChange={resetFormInfo}
                        />
                    </div>
                    <div className={form.element}>
                        <p className={form.label}>
                            Author - <i>optional</i>
                        </p>
                        <input name="author" className={form.input} onChange={resetFormInfo} />
                    </div>
                    <div className={form.element}>
                        <p className={form.label}>
                            Poster - <i>optional</i>
                        </p>
                        <UploadButton setSelectedFile={setSelectedFile} selectedFile={selectedFile} />
                    </div>
                </div>

                <FormEnd submitText={"Create"} onBack={() => exitCreating()} />
            </form>
        </div>
    );
};

export default CreateProjectPage;
