import React from "react";

type Props = {
    name: string;
    deleteCharacter: (name: string) => void;
};

const CharacterExport = ({ name, deleteCharacter }: Props) => {
    return (
        <div className="character-export-item">
            <p>{name}</p>
            <button
                onClick={() => deleteCharacter(name)}
                className="character-export-item-cross"
            >
                X
            </button>
        </div>
    );
};

export default CharacterExport;
