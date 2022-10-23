import type { GetServerSideProps, NextApiRequest, NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import LoginContainer from "../components/home/login/LoginContainer";
import { clearNavbarProject, VerificationStatus } from "../src/lib/utils";
import { useContext, useEffect } from "react";
import { UserContext } from "../src/context/UserContext";

type Props = {
    verificationStatus: VerificationStatus;
};

const LoginPage: NextPage<Props> = ({ verificationStatus }: Props) => {
    clearNavbarProject();

    return (
        <>
            <Head>
                <title>Scriptio - Log in</title>
            </Head>
            <LoginContainer verificationStatus={verificationStatus} />
        </>
    );
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
    const verified = ctx.query["verificationStatus"];

    if (verified !== undefined) {
        return { props: { verificationStatus: +verified } };
    }

    return { props: {} };
};

export default LoginPage;
