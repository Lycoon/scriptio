import { useEffect, useState } from "react";

const UploadButton = () => {
  const [dragover, setDragover] = useState<Boolean>(false);

  useEffect(() => {
    console.log(dragover);
  }, [dragover]);

  return (
    <>
      <label
        onDragEnter={() => setDragover(true)}
        onDragLeave={() => setDragover(false)}
        className="upload-button"
        htmlFor="movie-poster-input"
      >
        <div
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
