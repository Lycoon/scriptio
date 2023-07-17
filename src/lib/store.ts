import { useState } from "react";
import { Store } from "tauri-plugin-store-api";
import { DesktopResponse } from "./utils/types";
import { useDesktop } from "./utils/hooks";

const DEFAULT_STORE = "scriptio.cfg";
const stores: { [store: string]: Store } = {};

const getTauriStore = (filename: string) => {
    if (!stores[filename]) stores[filename] = new Store(filename);
    return stores[filename];
};

const useDesktopData = <T>(action: Promise<any> | undefined): DesktopResponse<T> => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<any>(undefined);
    const [data, setData] = useState<any>(undefined);

    if (!action) return { isLoading: false, data: undefined, error: undefined };

    action
        .then((_data) => {
            setIsLoading(false);
            setData(_data);
        })
        .catch((err) => {
            setIsLoading(false);
            setError(err);
        });

    return { isLoading, data, error };
};

export const setDesktopValue = async <T>(
    key: string,
    value: T,
    storeName: string
): Promise<any> => {
    const store = getTauriStore(storeName ?? DEFAULT_STORE);

    try {
        await store.set(key, value);
    } catch (error) {
        return { error };
    }

    return {};
};

export const deleteDesktopValue = async (key: string, storeName: string): Promise<any> => {
    const store = getTauriStore(storeName ?? DEFAULT_STORE);

    try {
        await store.delete(key);
    } catch (error) {
        return { error };
    }

    return {};
};

export const useDesktopValue = <T>(key: string, storeName: string): DesktopResponse<T> => {
    const isDesktop = useDesktop();
    const store = isDesktop ? getTauriStore(storeName ?? DEFAULT_STORE) : undefined;

    const { isLoading, data, error } = useDesktopData<T>(store?.get(key));
    return { isLoading, data, error };
};

export const useDesktopHas = (key: string, storeName: string): DesktopResponse<boolean> => {
    const isDesktop = useDesktop();
    const store = isDesktop ? getTauriStore(storeName ?? DEFAULT_STORE) : undefined;

    const { isLoading, data, error } = useDesktopData<boolean>(store?.has(key));
    return { isLoading, data, error };
};

export const useDesktopValues = (storeName: string): DesktopResponse<string[]> => {
    const isDesktop = useDesktop();
    const store = isDesktop ? getTauriStore(storeName ?? DEFAULT_STORE) : undefined;

    const { isLoading, data, error } = useDesktopData<string[]>(store?.keys());
    return { isLoading, data, error };
};
