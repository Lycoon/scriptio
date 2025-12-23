import { useState } from "react";
import { cropImageBase64, join } from "@src/lib/utils/misc";
import { FormInfoType } from "../utils/FormInfo";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { createProject } from "@src/lib/utils/requests";
import { useDesktop, useUser } from "@src/lib/utils/hooks";
import UploadButton from "./UploadButton";
import FormHeader from "./FormHeader";
import FormEnd from "./FormEnd";

import form from "../utils/Form.module.css";
import layout from "../utils/Layout.module.css";
import { CreateProjectBody } from "@pages/api/projects";
import { ApiResponse } from "@src/lib/utils/api-utils";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const CreateProjectPage = ({ setIsCreating }: Props) => {
    const { user } = useUser();
    const isDesktop = useDesktop();

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
        console.log("submitting");
        resetFormInfo();

        if (!user) return;

        const body: CreateProjectBody = {
            title: e.target.title.value,
            description: e.target.description.value,
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
        setIsCreating(false);
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
