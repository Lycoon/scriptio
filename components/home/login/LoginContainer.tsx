import { VerificationStatus } from "@src/lib/utils/enums";
import LoginForm from "./LoginForm";

import layout from "../../utils/Layout.module.css";

type Props = {
    verificationStatus: VerificationStatus;
};

const LoginContainer = ({ verificationStatus }: Props) => {
    return (
        <div className={layout.center_middle}>
            <LoginForm verificationStatus={verificationStatus} />
        </div>
    );
};

export default LoginContainer;
