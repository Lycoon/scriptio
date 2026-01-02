import { NextPage } from "next";
import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";

import layout from "../../utils/Layout.module.css";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

type Props = {
    userId: string;
    recoverHash: string;
};

const RecoveryContainer: NextPage<Props> = ({ userId, recoverHash }: Props) => {
    const form = recoverHash ? <PasswordChangeForm userId={userId} recoverHash={recoverHash} /> : <RecoveryForm />;
    return <>
        <div className={layout.center_middle}>{form}
        </div>
    </>
};

export default RecoveryContainer;
