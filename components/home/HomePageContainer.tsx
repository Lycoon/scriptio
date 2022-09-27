import Router from "next/router";

const HomePageContainer = () => {
    const onLogIn = () => {
        Router.push("/login");
    };

    const onSignUp = () => {
        Router.push("/signup");
    };

    return (
        <div id="homepage">
            <div className="homepage-text">
                <h1 id="scriptio-title" className="fade-in">
                    Scriptio
                </h1>
                <h2 id="scriptio-desc" className="fade-in">
                    Minimalist tool for perfectionist screenwriters
                </h2>
            </div>
            <div className="homepage-buttons fade-in">
                <button onClick={onSignUp} className="homepage-btn">
                    Sign up
                </button>
                <button onClick={onLogIn} className="homepage-btn">
                    Log in
                </button>
            </div>
        </div>
    );
};

export default HomePageContainer;
