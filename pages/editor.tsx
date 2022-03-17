import type { NextPage } from "next";
import Head from "next/head";
import EditorContainer from "../components/EditorContainer";
import HomePageNavbar from "../components/HomePageNavbar";

const EditorPage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Scriptio - Editor</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar className="navbar" />
        <EditorContainer />
      </div>
    </div>
  );
};

export default EditorPage;

export function getServerSideProps(context: any) {
  var htmlTo = require("htmlto");
  var options = {
    pathTohtml: "./public/html/index.html",
    pathTopdf: "./public/pdf/index.pdf",
    paperSize: {
      format: "A4",
      orientation: "portrait",
      margin: "1.5cm",
    },
  };

  htmlTo.pdf(options, function (err: any, result: any) {
    if (err) throw err;
    console.log("result :", result);
  });

  return {
    props: {}, // will be passed to the page component as props
  };
}
