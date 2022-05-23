const EmptyProjectPage = (props: any) => {
  const setIsCreating = props.setIsCreating;
  return (
    <button id="empty-project-page" onClick={() => setIsCreating(true)}>
      <p className="empty-project-title">Click to create your first project</p>
    </button>
  );
};

export default EmptyProjectPage;
