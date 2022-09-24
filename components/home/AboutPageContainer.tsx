import Router from "next/router";

const AboutPageContainer = () => {
    const redirectGithub = () => {
        window.open("https://github.com/lycoon", "_ blank");
    };
    const redirectTwitter = () => {
        window.open("https://twitter.com/LycoonMC", "_ blank");
    };
    const redirectDiscord = () => {
        window.open(
            "https://discordapp.com/users/138282927502000128",
            "_ blank"
        );
    };
    const redirectLinkedIn = () => {
        window.open("https://www.linkedin.com/in/hugo-bois-dev/", "_ blank");
    };

    return (
        <div id="about-container">
            <div className="about-center">
                <div id="about-header">
                    <div className="about-header-name">
                        <h1>Hugo Bois</h1>
                        <p>Developer</p>
                    </div>
                    <div className="about-icons">
                        <img
                            className="social-icon"
                            src="/images/social/github.png"
                            onClick={redirectGithub}
                        />
                        <img
                            className="social-icon"
                            src="/images/social/twitter.png"
                            onClick={redirectTwitter}
                        />
                        <img
                            className="social-icon"
                            src="/images/social/discord.png"
                            onClick={redirectDiscord}
                        />
                        <img
                            className="social-icon"
                            src="/images/social/linkedin.png"
                            onClick={redirectLinkedIn}
                        />
                    </div>
                </div>
                <p className="about-paragraph">
                    I'm currently studying a Masters of Computer Science
                    Engineering specialized in computer graphics. I enjoy a lot
                    working on several projects in my spare time, discovering
                    and experimenting new technologies. Someday, I had the idea
                    of Scriptio while web development had never been my field of
                    interest nor something that even got my interest.
                </p>
                <p className="about-paragraph">
                    I'm passionate about cinema and moviemaking, especially
                    screenwriting. I used to write stuff using tools such as
                    <i> Celtx</i> which eventually appeared to have cumbersome
                    interface and limited usage for the free plan. By the end of
                    2015 and for few years on, I switched to{" "}
                    <i>Amazon Storywriter</i>, which had been a real pleasure
                    creating stories with.
                </p>
                <p className="about-paragraph">
                    Unfortunately, in 2019, Storywriter was shut down by Amazon,
                    letting me orphan of such an amazing screenwriting tool that
                    was free, online, pretty and minimalist. It will have taken
                    me 3 years, on January 2022, to get the idea of developing
                    Scriptio. The main focus was first put on the editor itself,
                    which took a month to be workable.
                </p>
            </div>
        </div>
    );
};

export default AboutPageContainer;
