import "@styles/globals.css";

import type { AppProps } from "next/app";
import { UserContextProvider } from "@src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "@src/lib/fetchJson";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Loading from "@components/utils/Loading";
import { ThemeProvider } from "next-themes";
import { useDesktop } from "@src/lib/utils/hooks";

import layout from "../components/utils/Layout.module.css";
import { ProjectContextProvider } from "@src/context/ProjectContext";
import { PopupContextProvider } from "@src/context/PopupContext";
import Head from "next/head";

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
        <>
            <Head>
                <title>Scriptio</title>
            </Head>
            <SWRConfig
                value={{
                    fetcher: fetchJson,
                    onSuccess: () => {},
                    onError: (err) => {
                        console.error(err);
                    },
                }}
            >
                <UserContextProvider>
                    <ProjectContextProvider>
                        <PopupContextProvider>
                            <ThemeProvider attribute="class" defaultTheme="dark">
                                <div className={layout.main}>
                                    {pageLoading ? <Loading /> : <Component {...pageProps} />}
                                </div>
                            </ThemeProvider>
                        </PopupContextProvider>
                    </ProjectContextProvider>
                </UserContextProvider>
            </SWRConfig>
        </>
    );
}

export default MyApp;
