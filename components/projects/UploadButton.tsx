import Image from "next/image";
import { useEffect, useState } from "react";

import upload from "./UploadButton.module.css";

type Props = {
    selectedFile: any;
    setSelectedFile: (file: any) => void;
};

const UploadButton = ({ setSelectedFile, selectedFile }: Props) => {
    const [dragover, setDragover] = useState<Boolean>(false);
    const [preview, setPreview] = useState<string>();
    let dragoverStyle = dragover ? " dragover" : "";

    const resetSelectedFile = () => {
        setSelectedFile(null);
    };

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
        if (!e.target.files || e.target.files.length === 0) resetSelectedFile();
        else setSelectedFile(e.target.files[0]);
    };

    return (
        <>
            {!preview ? (
                <label
                    onDragEnter={() => setDragover(true)}
                    onDragLeave={() => setDragover(false)}
                    className={upload.container}
                    htmlFor="movie-poster-input"
                >
                    <div className={upload.dropfile_zone + dragoverStyle}>Click or drop here</div>
                    <input
                        id={upload.poster_input}
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={onSelectFile}
                    />
                </label>
            ) : (
                <div className={upload.preview}>
                    <Image
                        className={upload.preview_img}
                        src={preview}
                        width={140}
                        height={140}
                        alt={"Upload preview target"}
                    />
                    <div className={upload.preview_info}>
                        <p className="segoe">{selectedFile && selectedFile.name}</p>
                        <button className={upload.preview_delete} onClick={resetSelectedFile}>
                            X
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default UploadButton;
