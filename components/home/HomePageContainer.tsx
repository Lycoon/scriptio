import Image from "next/image";

const HomePageContainer = () => (
  <div id="homepage">
    <Image
      className="home_pic home_pic_left"
      src="/images/left-shadowed.png"
      alt="Left screenplay preview"
    />
    <Image
      className="home_pic home_pic_right"
      src="/images/right-shadowed.png"
      alt="Right screenplay preview"
    />
    <div className="homepage_text">
      <h1 id="scriptio_title" className="title">
        Scriptio
      </h1>
      <h2 id="scriptio_desc" className="title">
        Minimalist tool for perfectionist screenwriters
      </h2>
    </div>
  </div>
);

export default HomePageContainer;
