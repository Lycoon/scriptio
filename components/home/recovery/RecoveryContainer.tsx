import { NextPage } from "next";
import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";

import layout from "../../utils/Layout.module.css";

type Props = {
    userId: number;
    recoverHash: string;
};

const RecoveryContainer: NextPage<Props> = ({ userId, recoverHash }: Props) => {
    const form = recoverHash ? <PasswordChangeForm userId={userId} recoverHash={recoverHash} /> : <RecoveryForm />;
    return <div className={layout.center_middle}>{form}</div>;
};

export default RecoveryContainer;
