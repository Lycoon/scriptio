"use client";

import styles from "./EmptyProjectPage.module.css";

const EmptyProjectPage = (props: any) => {
    const setIsCreating = props.setIsCreating;
    return (
        <button className={styles.container} onClick={() => setIsCreating(true)}>
            <p className={styles.title}>Click to create your first project</p>
        </button>
    );
};

export default EmptyProjectPage;
