import "@styles/globals.css";

import { josefin, inter, courier } from "../styles/fonts";
import type { AppProps } from "next/app";
import { UserContextProvider } from "@src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "@src/lib/fetchJson";
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Loading from "@components/utils/Loading";
import { ThemeProvider } from "next-themes";
import { useDesktop, useUser } from "@src/lib/utils/hooks";

import layout from "../components/utils/Layout.module.css";
import { ProjectContextProvider } from "@src/context/ProjectContext";
import { PopupContextProvider } from "@src/context/PopupContext";
import Head from "next/head";
import { DashboardContextProvider } from "@src/context/DashboardContext";
import DashboardModal from "@components/dashboard/DashboardModal";
import Navbar from "@components/navbar/Navbar";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

const DESCRIPTION = "Imagine, tell, amaze. Scriptio is your screenwriting companion designed with simplicity in mind and no frills.";
const TITLE = "Scriptio | Minimalist tool for perfectionist screenwriters";
const TITLE_IMG = "https://scriptio.app/images/banner.png";
const URL = "https://scriptio.app/";

interface AppProvidersProps {
    children: ReactNode;
}

const AppProviders = ({ children }: AppProvidersProps) => {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: false,
                fetcher: fetchJson,
                onSuccess: () => { },
                onError: (err) => {
                    console.error(err);
                },
            }}
        >
            <UserContextProvider>
                <ProjectContextProvider>
                    <PopupContextProvider>
                        <DashboardContextProvider>
                            <ThemeProvider attribute="class" defaultTheme="dark">
                                {children}
                            </ThemeProvider>
                        </DashboardContextProvider>
                    </PopupContextProvider>
                </ProjectContextProvider>
            </UserContextProvider>
        </SWRConfig>
    );
}

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

const AppContent = ({ Component, pageProps }: AppProps) => {
    const { user } = useUser();
    const [pageLoading, setPageLoading] = useState<boolean>(false);
    const router = useRouter();

    useEffect(() => {
        const handleStart = () => setPageLoading(true);
        const handleComplete = () => setPageLoading(false);

        router.events.on("routeChangeStart", handleStart);
        router.events.on("routeChangeComplete", handleComplete);
        router.events.on("routeChangeError", handleComplete);

        return () => {
            // Good practice to cleanup listeners
            router.events.off("routeChangeStart", handleStart);
            router.events.off("routeChangeComplete", handleComplete);
            router.events.off("routeChangeError", handleComplete);
        }
    }, [router]);

    return (
        <div className="app-layout">
            {user ? <Navbar /> : <LandingPageNavbar />}
            <main className={`${layout.main} ${courier.variable} ${inter.variable} ${josefin.variable}`}>
                {pageLoading ? <Loading /> : <Component {...pageProps} />}
            </main>
            <DashboardModal />
        </div>
    );
};

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <>
            <Head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="theme-color" content="#525252" />
                <meta name="author" content="Hugo 'Lycoon' Bois" />
                <meta name="keywords" content="movie, script, writing, story, screenwriting" />

                {/* Primary metadata */}
                <title>{TITLE}</title>
                <meta name="title" content={TITLE} key="title" />
                <meta name="description" content={DESCRIPTION} key="desc" />

                {/* OpenGraph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content={URL} key="og-url" />
                <meta property="og:title" content={TITLE} key="og-title" />
                <meta property="og:description" content={DESCRIPTION} key="og-desc" />
                <meta property="og:image" content={TITLE_IMG} key="og-image" />

                {/* Twitter */}
                <meta property="twitter:card" content="summary_large_image" />
                <meta property="twitter:url" content={URL} key="tw-url" />
                <meta property="twitter:title" content={TITLE} key="tw-title" />
                <meta property="twitter:description" content={DESCRIPTION} key="tw-desc" />
                <meta property="twitter:image" content={TITLE_IMG} key="tw-image" />
            </Head>
            <AppProviders>
                <AppContent {...pageProps} Component={Component} />
            </AppProviders>
        </>
    );
}

export default MyApp;
