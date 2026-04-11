"use client";

import Image from "next/image";
import { useEffect, useState, ChangeEvent, DragEvent } from "react";
import upload from "./UploadButton.module.css";

// Use a simple SVG for the "Upload" icon
const UploadIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
);

type Props = {
    selectedFile: File | null;
    setSelectedFile: (file: File | null) => void;
};

const UploadButton = ({ setSelectedFile, selectedFile }: Props) => {
    const [dragActive, setDragActive] = useState(false);
    const [preview, setPreview] = useState<string | undefined>();

    useEffect(() => {
        if (!selectedFile) {
            setPreview(undefined);
            return;
        }
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    const handleFile = (file: File) => {
        if (file.type.startsWith("image/")) {
            setSelectedFile(file);
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleDrag = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className={upload.wrapper}>
            {!preview ? (
                <label
                    className={`${upload.dropzone} ${dragActive ? upload.dragActive : ""}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        className={upload.hiddenInput}
                        accept="image/png, image/jpeg"
                        onChange={handleChange}
                    />
                    <div className={upload.dropzoneContent}>
                        <div className={upload.iconContainer}>
                            <UploadIcon />
                        </div>
                        <span className={upload.mainText}>Click to upload</span>
                        <span className={upload.subText}>or drag and drop</span>
                    </div>
                </label>
            ) : (
                <div className={upload.selectedCard}>
                    <div className={upload.thumbnail}>
                        <Image src={preview} layout="fill" objectFit="cover" alt="Selected file" />
                    </div>
                    <div className={upload.fileInfo}>
                        <p className={upload.fileName}>{selectedFile?.name}</p>
                        <button className={upload.removeBtn} onClick={() => setSelectedFile(null)}>
                            Remove image
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UploadButton;
