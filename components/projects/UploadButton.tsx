import { useState } from "react";

const UploadButton = () => {
  const [dragover, setDragover] = useState<Boolean>(false);

  return (
    <>
      <label className="upload-button" htmlFor="movie-poster-input">
        <div
          onDragEnter={() => setDragover(true)}
          onDragLeave={() => setDragover(false)}
          className={
            "segoe-bold upload-button-div" + (dragover ? " dragover" : "")
          }
        >
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
