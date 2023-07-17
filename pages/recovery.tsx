import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import RecoveryContainer from "@components/home/recovery/RecoveryContainer";
import { UserContext } from "@src/context/UserContext";

type Props = {
    userId: number;
    recoverHash: string;
};

const RecoveryPage: NextPage<Props> = ({ userId, recoverHash }: Props) => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio - Recover password</title>
            </Head>
            <RecoveryContainer userId={userId} recoverHash={recoverHash} />
        </>
    );
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
    const userId = ctx.query["id"];
    const recoverHash = ctx.query["code"];

    if (recoverHash && userId) {
        return { props: { userId, recoverHash } };
    }

    return { props: {} };
};

export default RecoveryPage;
