import "../styles/globals.css";
import type { AppProps } from "next/app";
import { ContextProvider } from "../src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";

function MyApp({ Component, pageProps }: AppProps) {
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
        <Component {...pageProps} />
      </ContextProvider>
    </SWRConfig>
  );
}

export default MyApp;
