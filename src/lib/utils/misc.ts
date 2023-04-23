export const isValidDelay = (date: Date, minutes: number) => {
    const now = new Date().getTime();
    const last = date.getTime();
    const lastMinutes = (now - last) / 1000 / 60;

    return minutes < lastMinutes;
};

export const getBase64 = async (file: File, width: number, height: number) => {
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return "data:,";
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    let ratio = Math.min(width / img.width, height / img.height);
    ctx?.drawImage(img, 0, 0, img.width * ratio, img.height * ratio);

    return ctx.canvas.toDataURL("image/jpeg") || "data:,";
};
