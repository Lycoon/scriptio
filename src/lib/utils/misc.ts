export const isValidDelay = (date: Date, minutes: number) => {
    const now = new Date().getTime();
    const last = date.getTime();
    const lastMinutes = (now - last) / 1000 / 60;

    return minutes < lastMinutes;
};

type TimeUnit = "seconds" | "minutes" | "hours" | "days";

/**
 * Checks if a given date is older than the specified duration.
 * @param date - The date to check (Date object, ISO string, or timestamp)
 * @param duration - The amount of time (e.g., 30)
 * @param unit - The unit of time (e.g., 'minutes')
 * @returns true if the date is "too old" (expired), false otherwise
 */
export function hasExpired(date: Date | string | number, duration: number, unit: TimeUnit = "minutes"): boolean {
    const dateMs = new Date(date).getTime();
    if (isNaN(dateMs)) {
        throw new Error("Invalid date provided to hasExpired");
    }

    const multipliers: Record<TimeUnit, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
    };

    const timeLimitMs = duration * multipliers[unit];
    const now = Date.now();

    return now - dateMs > timeLimitMs;
}

export const cropImageBase64 = async (file: File, width: number, height: number) => {
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

    const ratio = Math.min(width / img.width, height / img.height);
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

export const isEmptyObject = (obj: object) => {
    return Object.keys(obj).length === 0;
};

export const getRandomColor = () => {
    return (
        "#" +
        Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, "0")
    );
};
