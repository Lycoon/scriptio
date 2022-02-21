import "../styles/globals.css";
import type { AppProps } from "next/app";
import { EditorProvider } from "../context/AppContext";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <EditorProvider>
      <Component {...pageProps} />
    </EditorProvider>
  );
}

export default MyApp;
