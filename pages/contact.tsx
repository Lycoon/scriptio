import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import { clearNavbarProject } from "../src/lib/utils";

const ContactPage = () => {
    clearNavbarProject();

    return (
        <>
            <Head>
                <title>Scriptio - Contact</title>
            </Head>
        </>
    );
};

export default ContactPage;
