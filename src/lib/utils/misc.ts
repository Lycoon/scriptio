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

export const _MS_PER_DAY = 1000 * 60 * 60 * 24;
export const getLastUpdate = (days: number) => {
    if (days === 0) return "Today";
    else if (days === 1) return "Yesterday";
    else if (days <= 30) return `${days} days ago`;
    else if (days <= 365) return `${Math.round(days / 30)} month(s) ago`;
    else return "More than 1 year ago";
};

export const getElapsedDaysFrom = (date: Date) => {
    return Math.round((Date.now() - new Date(date).getTime()) / _MS_PER_DAY);
};

export const join = (...args: string[]): string => {
    return args.join(" ");
};

export const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};
