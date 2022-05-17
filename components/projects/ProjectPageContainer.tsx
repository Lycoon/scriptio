import { useContext } from "react";
import { UserContext } from "../../src/context/UserContext";

const ProjectPageContainer = () => {
  const ctx = useContext(UserContext);
  const user = ctx.user;

  return <div id="project-page-container">Welcome {user?.email}!</div>;
};

export default ProjectPageContainer;
