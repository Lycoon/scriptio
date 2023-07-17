import SignupForm from "./SignupForm";

import layout from "../../utils/Layout.module.css";

const SignupContainer = () => {
    return (
        <div className={layout.center_middle}>
            <SignupForm />
        </div>
    );
};

export default SignupContainer;
