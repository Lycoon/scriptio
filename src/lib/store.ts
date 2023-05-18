import { useState } from "react";
import { Store } from "tauri-plugin-store-api";

const stores: { [store: string]: Store } = {};

const getTauriStore = (filename: string) => {
    if (!stores[filename]) stores[filename] = new Store(filename);
    return stores[filename];
};

export const useTauriStore = (key: string, value: any, storeName: string = "scriptio.cfg") => {
    const store = getTauriStore(storeName);
    const [state, setState] = useState(value);
    const [loading, setLoading] = useState(true);

    if (loading) {
        store.get(key).then((value) => {
            setState(value);
            setLoading(false);
        });
    }

    return { state, setState, loading };
};
