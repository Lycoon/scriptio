import { useEffect, useState } from "react";

type Props = {
    selectedFile: any;
    setSelectedFile: (file: any) => void;
};

const UploadButton = ({ setSelectedFile, selectedFile }: Props) => {
    const [dragover, setDragover] = useState<Boolean>(false);
    const [preview, setPreview] = useState<string>();
    let dragoverStyle = dragover ? " dragover" : "";

    useEffect(() => {
        if (!selectedFile) {
            setPreview(undefined);
            return;
        }

        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);

        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    const onSelectFile = (e: any) => {
        if (!e.target.files || e.target.files.length === 0)
            setSelectedFile(undefined);
        else setSelectedFile(e.target.files[0]);
    };

    return (
        <>
            {!preview ? (
                <label
                    onDragEnter={() => setDragover(true)}
                    onDragLeave={() => setDragover(false)}
                    className="upload-button"
                    htmlFor="movie-poster-input"
                >
                    <div className={"upload-button-div" + dragoverStyle}>
                        Click or drop here
                    </div>
                    <input
                        type="file"
                        id="movie-poster-input"
                        accept="image/png, image/jpeg"
                        onChange={onSelectFile}
                    />
                </label>
            ) : (
                <div className="upload-preview">
                    <img className="upload-preview-image" src={preview} />
                    <div className="upload-preview-info">
                        <p className="upload-preview-filename segoe">
                            {selectedFile && selectedFile.name}
                        </p>
                        <button
                            className="upload-preview-delete"
                            onClick={() => setSelectedFile(undefined)}
                        >
                            X
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default UploadButton;
