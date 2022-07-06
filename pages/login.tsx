import type { GetServerSideProps, NextApiRequest, NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import Navbar from "../components/navbar/Navbar";
import LoginContainer from "../components/home/login/LoginContainer";
import { VerificationStatus } from "../src/lib/utils";

type Props = {
    verificationStatus: VerificationStatus;
};

const LoginPage: NextPage<Props> = ({ verificationStatus }: Props) => (
    <>
        <Head>
            <title>Scriptio - Log in</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <LoginContainer verificationStatus={verificationStatus} />
            <HomePageFooter />
        </div>
    </>
);

export const getServerSideProps: GetServerSideProps = async (ctx) => {
    const verified = ctx.query["verificationStatus"];

    if (verified !== undefined) {
        return { props: { verificationStatus: +verified } };
    }

    return { props: {} };
};

export default LoginPage;
