import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import LoginContainer from "@components/home/login/LoginContainer";
import { useContext, useEffect } from "react";
import { VerificationStatus } from "@src/lib/utils/enums";
import { ProjectContext } from "@src/context/ProjectContext";

type Props = {
    verificationStatus: VerificationStatus;
};

const LoginPage: NextPage<Props> = ({ verificationStatus }: Props) => {
    const { updateProject } = useContext(ProjectContext);
    useEffect(() => updateProject(undefined), []);

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
