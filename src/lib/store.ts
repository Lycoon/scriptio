import { useState } from "react";
import { Store } from "tauri-plugin-store-api";

const stores: { [store: string]: Store } = {};

const getTauriStore = (filename: string) => {
    if (!stores[filename]) stores[filename] = new Store(filename);
    return stores[filename];
};

export const getDesktopValue = (key: string, storeName: string = "scriptio.cfg") => {
    const store = getTauriStore(storeName);
    const [loading, setLoading] = useState(true);
    const [getValue, setGetValue] = useState<any>();

    store.get(key).then((value) => {
        setLoading(false);
        setGetValue(value);
    });

    return { loading, getValue };
};

export const hasDesktopValue = (key: string, storeName: string = "scriptio.cfg") => {
    const store = getTauriStore(storeName);
    const [loading, setLoading] = useState(true);
    const [hasValue, setHasValue] = useState(false);

    store.has(key).then((value) => {
        setLoading(false);
        setHasValue(value);
    });

    return { loading, hasValue };
};

export const setDesktopValue = async <T>(
    key: string,
    value: T,
    storeName: string = "scriptio.cfg"
) => {
    const store = getTauriStore(storeName);
    return store.set(key, value);
};
