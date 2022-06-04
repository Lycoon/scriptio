import Image from "next/image";

const NewProjectItem = (props: any) => {
  const setIsCreating = props.setIsCreating;

  return (
    <button
      className="project-item new-project-item"
      onClick={() => setIsCreating(true)}
    >
      <div className="new-project-item-flex">
        <h2 className="new-project-item-title">Create project</h2>
        <Image
          className="new-project-icon"
          src="images/plus.svg"
          alt="Plus sign"
        />
      </div>
    </button>
  );
};

export default NewProjectItem;
