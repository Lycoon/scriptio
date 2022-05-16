import "../styles/globals.css";
import type { AppProps } from "next/app";
import { ContextProvider } from "../src/context/UserContext";
import { SWRConfig } from "swr";
import fetchJson from "../src/lib/fetchJson";
import { withIronSessionSsr } from "iron-session/next";
import { sessionOptions } from "../src/lib/session";

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
      <ContextProvider>
        <Component {...pageProps} />
      </ContextProvider>
    </SWRConfig>
  );
}

export const getServerSideProps = withIronSessionSsr(async function ({
  req,
  res,
}) {
  const user = req.session.user;

  if (user === undefined) {
    /*res.setHeader("location", "/");
    res.statusCode = 302;
    res.end();*/

    return {
      props: {
        user: {
          isLoggedIn: false,
          email: "",
          id: -1,
        },
      },
    };
  }

  return {
    props: { user: req.session.user },
  };
},
sessionOptions);

export default MyApp;
