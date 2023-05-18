import "../styles/globals.css";

import type { AppProps } from "next/app";
import { ContextProvider } from "../src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";
import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Loading from "../components/home/Loading";
import { ThemeProvider } from "next-themes";
import { UserContext } from "../src/context/UserContext";
import { useDesktop } from "../src/lib/utils/hooks";

const DesktopNavbar = () => {
    return (
        <div data-tauri-drag-region className="titlebar">
            <div className="titlebar-button" id="titlebar-minimize">
                <img src="https://api.iconify.design/mdi:window-minimize.svg" alt="minimize" />
            </div>
            <div className="titlebar-button" id="titlebar-maximize">
                <img src="https://api.iconify.design/mdi:window-maximize.svg" alt="maximize" />
            </div>
            <div className="titlebar-button" id="titlebar-close">
                <img src="https://api.iconify.design/mdi:close.svg" alt="close" />
            </div>
        </div>
    );
};

function MyApp({ Component, pageProps }: AppProps) {
    const [pageLoading, setPageLoading] = useState<boolean>(false);
    const router = useRouter();
    const isDesktop = useDesktop();

    useEffect(() => {
        const handleStart = () => {
            setPageLoading(true);
        };
        const handleComplete = () => {
            setPageLoading(false);
        };

        router.events.on("routeChangeStart", handleStart);
        router.events.on("routeChangeComplete", handleComplete);
        router.events.on("routeChangeError", handleComplete);
    }, [router]);

    return (
        <SWRConfig
            value={{
                fetcher: fetchJson,
                onSuccess: () => {},
                onError: (err) => {
                    console.error(err);
                },
            }}
        >
            <ContextProvider>
                <ThemeProvider attribute="class" defaultTheme="dark">
                    <div className="main-container">
                        {pageLoading ? <Loading /> : <Component {...pageProps} />}
                    </div>
                </ThemeProvider>
            </ContextProvider>
        </SWRConfig>
    );
}

export default MyApp;
