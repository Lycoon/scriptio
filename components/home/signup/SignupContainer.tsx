import SignupForm from "./SignupForm";

import layout from "../../utils/Layout.module.css";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

const SignupContainer = () => {
    return <>
        <div className={layout.center_middle}>
            <SignupForm />
        </div>
    </>
};

export default SignupContainer;
