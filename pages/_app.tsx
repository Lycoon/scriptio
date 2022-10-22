import "../styles/globals.css";
import type { AppProps } from "next/app";
import { ContextProvider } from "../src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Loading from "../components/home/Loading";
import { ThemeProvider } from "next-themes";
import Navbar from "../components/navbar/Navbar";

function MyApp({ Component, pageProps }: AppProps) {
    const [pageLoading, setPageLoading] = useState<boolean>(false);
    const router = useRouter();

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
                onSuccess: () => {},
                fetcher: fetchJson,
                onError: (err) => {
                    console.error(err);
                },
            }}
        >
            <ContextProvider>
                <ThemeProvider attribute="class" defaultTheme="dark">
                    <div className="main-container">
                        <Navbar />
                        {pageLoading ? (
                            <Loading />
                        ) : (
                            <Component {...pageProps} />
                        )}
                    </div>
                </ThemeProvider>
            </ContextProvider>
        </SWRConfig>
    );
}

export default MyApp;
