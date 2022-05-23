const onSubmit = (setIsCreating: any) => {
  // Successful project creation
  setIsCreating(false);
};

const NewProjectPage = (props: any) => {
  const setIsCreating = props.setIsCreating;

  return (
    <div id="new-project-page">
      <form id="new-project-form" onSubmit={() => onSubmit(setIsCreating)}>
        <h1 className="segoe-bold">New project</h1>
        <div id="email-form" className="form-element">
          <span className="form-label">Title</span>
          <input className="form-input" />
          <span className="form-label">Description (optional)</span>
          <input className="form-input" />
        </div>
        <div id="form-btn-flex">
          <button className="form-btn" type="submit">
            Create
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewProjectPage;
