import React from "react";

type Props = {
    content: string;
    isPdfExport: boolean;
    action: () => void;
};

const FileFormatButtonExport = ({ content, isPdfExport, action }: Props) => {
    return (
        <div
            onClick={action}
            className={
                "export-project-format" +
                (isPdfExport ? " selected-export-format" : "")
            }
        >
            <p>{content}</p>
        </div>
    );
};

export default FileFormatButtonExport;
