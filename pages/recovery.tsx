import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import RecoveryContainer from "../components/home/recovery/RecoveryContainer";
import RecoveryForm from "../components/home/recovery/RecoveryForm";

type Props = {
    userId: number;
    recoverHash: string;
};

const RecoveryPage: NextPage<Props> = ({ userId, recoverHash }: Props) => {
    return (
        <>
            <Head>
                <title>Scriptio - Recover password</title>
            </Head>
            <div className="main-container">
                <Navbar />
                <RecoveryContainer userId={userId} recoverHash={recoverHash} />
            </div>
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
