import empty from "./EmptyProjectPage.module.css";

const EmptyProjectPage = (props: any) => {
    const setIsCreating = props.setIsCreating;
    return (
        <button className={empty.container} onClick={() => setIsCreating(true)}>
            <p className={empty.title}>Click to create your first project</p>
        </button>
    );
};

export default EmptyProjectPage;
