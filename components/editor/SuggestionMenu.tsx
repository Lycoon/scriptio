import { useEffect, useState } from "react";

type Props = {
    suggestions: string[];
    pasteTextAt: (text: string, position: number) => void;
    suggestionData: SuggestionData;
};

type Position = {
    x: number;
    y: number;
};

export type SuggestionData = {
    position: Position;
    cursor: number;
    cursorInNode: number;
};

const SuggestionMenu = ({ pasteTextAt, suggestionData, suggestions }: Props) => {
    const [selectedIdx, setSelectedIdx] = useState(0);

    const selectSuggestion = (idx: number) => {
        const suggestion = suggestions[idx].slice(suggestionData.cursorInNode);
        if (suggestion) {
            pasteTextAt(suggestion, suggestionData.cursor);
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
            className="suggestion-menu"
            style={{
                top: suggestionData.position.y + 20,
                left: suggestionData.position.x,
            }}
        >
            {suggestions.map((suggestion: string, index: number) => (
                <div
                    className={`context-menu-item ${index === selectedIdx ? "selected" : ""}`}
                    onClick={() => selectSuggestion(index)}
                    key={index}
                >
                    <p className="suggestion-item unselectable">{suggestion}</p>
                </div>
            ))}
        </div>
    );
};

export default SuggestionMenu;
