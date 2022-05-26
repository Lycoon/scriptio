import "../styles/globals.css";
import type { AppProps } from "next/app";
import { ContextProvider } from "../src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";
import Head from "next/head";

const DESCRIPTION =
  "Imagine, tell, amaze. Scriptio is your screenwriting companion designed with simplicity in mind and no frills.";
const TITLE = "Scriptio | Minimalist tool for perfectionist screenwriters";
const TITLE_IMG = "https://scriptio.app/assets/homepage.png";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="title" content={TITLE} />
        <meta name="description" content={DESCRIPTION} />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://scriptio.app/" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={TITLE_IMG} />

        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://scriptio.app/" />
        <meta property="twitter:title" content={TITLE} />
        <meta property="twitter:description" content={DESCRIPTION} />
        <meta property="twitter:image" content={TITLE_IMG} />
      </Head>
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
          <Component {...pageProps} />
        </ContextProvider>
      </SWRConfig>
    </>
  );
}

export default MyApp;
