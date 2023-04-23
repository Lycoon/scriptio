import { VerificationStatus } from "../../../src/lib/utils/misc";
import LoginForm from "./LoginForm";

type Props = {
    verificationStatus: VerificationStatus;
};

const LoginContainer = ({ verificationStatus }: Props) => {
    return (
        <div id="login-page">
            <LoginForm verificationStatus={verificationStatus} />
        </div>
    );
};

export default LoginContainer;
