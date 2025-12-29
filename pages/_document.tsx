import NextDocument, { Html, Main, Head, NextScript } from "next/document";

type Props = {};

class Document extends NextDocument<Props> {
    render() {
        return (
            <Html lang="en">
                <Head>
                    <link rel="icon" href="/favicon.ico" />
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
