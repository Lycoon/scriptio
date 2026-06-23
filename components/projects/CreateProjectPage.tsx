"use client";

import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { join } from "@src/lib/utils/misc";
import { FormInfoType } from "../utils/FormInfo";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { createProject } from "@src/lib/utils/requests";
import { useCookieUser, useIsPro } from "@src/lib/utils/hooks";
import FormHeader from "./FormHeader";
import FormEnd from "./FormEnd";

import form from "../utils/Form.module.css";
import layout from "../utils/Layout.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { CreateProjectBody } from "@src/lib/utils/api-bodies";
import { useTranslations } from "next-intl";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const CreateProjectPage = ({ setIsCreating }: Props) => {
    const { user } = useCookieUser();
    const { isPro } = useIsPro();
    const t = useTranslations("projects");

    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);

    const exitCreating = () => {
        setIsCreating(false);
    };

    const resetFormInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        resetFormInfo();

        const form = e.target as typeof e.target & {
            title: { value: string };
            description: { value: string };
        };
        const title = form.title.value;
        const description = form.description.value;

        // Desktop: offline-first project creation
        // Always create locally. If Pro and signed in, try cloud first to use its ID.
        if (isTauri()) {
            let projectId: string | null = null;
            try {
                // If Pro and signed in, try creating on server to get the cloud project ID
                if (user && isPro) {
                    try {
                        const body: CreateProjectBody = { title, description };
                        const res = await createProject(body);
                        const json = (await res.json()) as ApiResponse<{ id: string }>;
                        if (res.ok && json.data) {
                            projectId = json.data.id;
                        }
                    } catch {
                        // Server unreachable - will generate a local ID below
                    }
                }

                // Always create local SQLite entry, using the cloud ID if available
                const { createCachedProject, createCachedProjectWithId } =
                    await import("@src/lib/persistence/storage-provider/local-persistence");
                if (projectId) {
                    await createCachedProjectWithId(projectId, title, description, true);
                } else {
                    const cachedProject = await createCachedProject(title, description);
                    projectId = cachedProject.id;
                }
            } catch (error) {
                console.log("Failed to create project:", error);
                setFormInfo({ content: t("form.failedToCreate"), isError: true });
            }
            // Redirect outside try-catch since Next.js redirect() throws NEXT_REDIRECT
            if (projectId) {
                redirectScreenplay(projectId);
            }
            return;
        }

        // Web: create via API if authenticated Pro, otherwise create locally (IndexedDB)
        if (user && isPro) {
            const body: CreateProjectBody = { title, description };
            const res = await createProject(body);
            const json = (await res.json()) as ApiResponse<{ id: string }>;
            if (!res.ok || !json.data) {
                setFormInfo({ content: json.message!, isError: true });
                return;
            }

            // Also create local entry for offline cache
            const { createCachedProjectWithId } =
                await import("@src/lib/persistence/storage-provider/local-persistence");
            await createCachedProjectWithId(json.data.id, title, description, true);
            redirectScreenplay(json.data.id);
        } else {
            // Unauthenticated or non-Pro: create local-only project (IndexedDB)
            const { createCachedProject } = await import("@src/lib/persistence/storage-provider/local-persistence");
            const cachedProject = await createCachedProject(title, description);
            redirectScreenplay(cachedProject.id);
        }
    };

    return (
        <div className={layout.center_row}>
            <form className={form.container} onSubmit={onSubmit}>
                <FormHeader title={t("form.formTitle")} formInfo={formInfo} />

                <div className={form.elements}>
                    <div className={form.element}>
                        <p className={form.label}>{t("form.titleField")}</p>
                        <input name="title" className={form.input} onChange={resetFormInfo} required />
                    </div>
                    <div className={form.element}>
                        <p className={form.label}>
                            {t("form.descriptionField")} - <i>{t("form.optional")}</i>
                        </p>
                        <textarea
                            name="description"
                            className={join(form.input, form.input_desc)}
                            onChange={resetFormInfo}
                        />
                    </div>
                </div>

                <FormEnd submitText={t("form.submitBtn")} onBack={() => exitCreating()} />
            </form>
        </div>
    );
};

export default CreateProjectPage;
