import React from "react";

import project_ from "./ExportProjectContainer.module.css";

type Props = {
    content: string;
    isPdfExport: boolean;
    action: () => void;
};

const FileFormatButtonExport = ({ content, isPdfExport, action }: Props) => {
    return (
        <div
            onClick={action}
            className={project_.format + (isPdfExport ? " " + project_.active_format : "")}
        >
            <p>{content}</p>
        </div>
    );
};

export default FileFormatButtonExport;
