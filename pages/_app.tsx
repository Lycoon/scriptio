import "../styles/globals.css";
import type { AppProps } from "next/app";
import { EditorProvider } from "../context/AppContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SWRConfig
      value={{
        onSuccess: () => {
          console.log("SUCCESS");
        },
        fetcher: fetchJson,
        onError: (err) => {
          console.error(err);
        },
      }}
    >
      <EditorProvider>
        <Component {...pageProps} />
      </EditorProvider>
    </SWRConfig>
  );
}

export default MyApp;
