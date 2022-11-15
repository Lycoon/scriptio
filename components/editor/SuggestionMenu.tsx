import { useEffect, useState } from "react";

type Props = {
    suggestions: string[];
    pasteText: (text: string) => void;
    position: Position;
};

export type Position = {
    x: number;
    y: number;
};

const SuggestionMenu = ({ suggestions, pasteText, position }: Props) => {
    const [selectedIdx, setSelectedIdx] = useState(0);

    const selectSuggestion = (idx: number) => {
        const suggestion = suggestions[idx];
        if (suggestion) {
            pasteText(suggestion);
        }
    };

    /* Suggestions menu keyboard events */
    const upHandler = () => {
        setSelectedIdx((selectedIdx + suggestions.length - 1) % suggestions.length);
    };
    const downHandler = () => {
        setSelectedIdx((selectedIdx + 1) % suggestions.length);
    };
    const enterHandler = () => {
        selectSuggestion(selectedIdx);
    };

    const pressedKeyEvent = (e: KeyboardEvent) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            upHandler();
            return true;
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            downHandler();
            return true;
        } else if (e.key === "Enter") {
            console.log("selected suggestion");
            enterHandler();
            return true;
        }
        return false;
    };

    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
        };
    });

    return (
        <div
            className="context-menu"
            style={{
                top: position.y + 20,
                left: position.x,
            }}
        >
            {suggestions.map((suggestion: string, index: number) => (
                <div
                    key={index}
                    onClick={() => selectSuggestion(index)}
                    className={`context-menu-item ${index === selectedIdx ? "selected" : ""}`}
                >
                    <p className="unselectable">{suggestion}</p>
                </div>
            ))}
        </div>
    );
};

export default SuggestionMenu;
