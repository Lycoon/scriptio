import { useEffect, useState } from "react";

const UploadButton = () => {
    const [dragover, setDragover] = useState<Boolean>(false);

    useEffect(() => {}, [dragover]);
    let dragoverStyle = dragover ? " dragover" : "";

    return (
        <>
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
                />
            </label>
            <p id="filename"></p>
        </>
    );
};

export default UploadButton;
