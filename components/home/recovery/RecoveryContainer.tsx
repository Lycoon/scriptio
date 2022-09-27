import { NextPage } from "next";
import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";

type Props = {
    userId: number;
    recoverHash: string;
};

const RecoveryContainer: NextPage<Props> = ({ userId, recoverHash }: Props) => {
    const form = recoverHash ? (
        <PasswordChangeForm userId={userId} recoverHash={recoverHash} />
    ) : (
        <RecoveryForm />
    );
    return <div id="recovery-page">{form}</div>;
};

export default RecoveryContainer;
