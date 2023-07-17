import { useState } from "react";
import { getBase64, join } from "@src/lib/utils/misc";
import FormInfo, { FormInfoType } from "../../utils/FormInfo";
import UploadButton from "../UploadButton";
import { Project } from "@prisma/client";
import { editProject } from "@src/lib/utils/requests";
import { ProjectUpdateDTO } from "@src/lib/utils/types";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import FormEnd from "../FormEnd";

import layout from "../../utils/Layout.module.css";
import form from "../../utils/Form.module.css";

type Props = {
    project: Project;
};

const EditProjectConainer = ({ project }: Props) => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const resetFormInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        const body: ProjectUpdateDTO = {
            projectId: project.id,
            title: e.target.title.value,
            description: e.target.description.value,
        };

        if (selectedFile) {
            body.poster = await getBase64(selectedFile, 686, 1016);
        }

        const res = await editProject(body);
        const json = await res.json();

        if (res.ok) {
            redirectScreenplay(project.id);
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <div className={layout.center_row}>
            <form className={form.container} onSubmit={onSubmit}>
                <div>
                    <h1>Edit project</h1>
                    <hr />
                    {formInfo && <FormInfo info={formInfo} />}
                </div>

                <div className={form.elements}>
                    <div className={form.element}>
                        <p className={form.element_title}>Title</p>
                        <input
                            name="title"
                            className={form.input}
                            defaultValue={project.title}
                            onChange={resetFormInfo}
                            required
                        />
                    </div>
                    <div className={form.element}>
                        <p className={form.element_title}>Description</p>
                        <textarea
                            name="description"
                            className={join(form.input, form.input_desc)}
                            defaultValue={project.description ?? undefined}
                            onChange={resetFormInfo}
                        />
                    </div>
                    <div className={form.element}>
                        <p className={form.element_title}>Poster</p>
                        <UploadButton setSelectedFile={setSelectedFile} selectedFile={selectedFile} />
                    </div>
                </div>

                <FormEnd submitText={"Confirm"} onBack={() => redirectScreenplay(project.id)} />
            </form>
            {/*<ProjectDangerZone project={project} user={user} />*/}
        </div>
    );
};

export default EditProjectConainer;
