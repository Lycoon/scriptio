import NextDocument, { Html, Head, Main, NextScript } from "next/document";
import React from "react";

const DESCRIPTION =
    "Imagine, tell, amaze. Scriptio is your screenwriting companion designed with simplicity in mind and no frills.";
const TITLE = "Scriptio | Minimalist tool for perfectionist screenwriters";
const TITLE_IMG = "https://scriptio.app/images/banner.png";
const URL = "https://scriptio.app/";

type Props = {};

class Document extends NextDocument<Props> {
    render() {
        return (
            <Html lang="en">
                <Head>
                    <title>Scriptio</title>
                    <meta name="title" content={TITLE} />
                    <meta name="description" content={DESCRIPTION} />
                    <meta name="author" content="Hugo 'Lycoon' Bois" />
                    <meta name="theme-color" content="#525252" />
                    <meta
                        name="keywords"
                        content="movie, script, writing, story, storywriting, screenwriting, screenwriter"
                    />

                    <meta property="og:type" content="website" />
                    <meta property="og:url" content={URL} />
                    <meta property="og:title" content={TITLE} />
                    <meta property="og:description" content={DESCRIPTION} />
                    <meta property="og:image" content={TITLE_IMG} />

                    <meta property="twitter:card" content={TITLE_IMG} />
                    <meta property="twitter:url" content={URL} />
                    <meta property="twitter:title" content={TITLE} />
                    <meta property="twitter:description" content={DESCRIPTION} />
                    <meta property="twitter:image" content={TITLE_IMG} />
                </Head>
                <body>
                    <Main />
                    <NextScript />
                </body>
            </Html>
        );
    }
}

export default Document;
