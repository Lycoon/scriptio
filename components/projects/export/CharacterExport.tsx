import React from "react";

import item from "./CharacterExport.module.css";

type Props = {
    name: string;
    deleteCharacter: (name: string) => void;
};

const CharacterExport = ({ name, deleteCharacter }: Props) => {
    return (
        <div className={item.container}>
            <div className={item.content}>
                <p>{name}</p>
                <button
                    onClick={() => deleteCharacter(name)}
                    className="character-export-item-cross"
                >
                    X
                </button>
            </div>
        </div>
    );
};

export default CharacterExport;
