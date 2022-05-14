const ProjectPageContainer = (props: any) => {
  const user = props.user;
  return <div id="project-page-container">Welcome {user.email}!</div>;
};

export default ProjectPageContainer;
