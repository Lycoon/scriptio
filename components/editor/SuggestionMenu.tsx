import { useEffect, useState } from "react";

type Props = {
    suggestions: string[];
    pasteText: (text: string) => void;
};

const SuggestionMenu = ({ suggestions, pasteText }: Props) => {
    const [selectedIdx, setSelectedIdx] = useState(0);

    const selectSuggestion = (idx: number) => {
        const item = suggestions[idx];
        if (item) {
            pasteText(item);
        }
    }

    const upHandler = () => {
        setSelectedIdx((selectedIdx + suggestions.length - 1) % suggestions.length)
    }

    const downHandler = () => {
        setSelectedIdx((selectedIdx + 1) % suggestions.length)
    }

    const enterHandler = () => {
        selectSuggestion(selectedIdx);
    }

    const pressedKeyEvent = (e: KeyboardEvent) => {
        if (e.key === "ArrowUp") {
            upHandler();
            return true;
        } 
        else if (e.key === "ArrowDown") {
            downHandler();
            return true;
        } 
        else if (e.key === "Enter") {
            enterHandler();
            return true;
        }
        return false;
    }

    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
        };
    });

    return (
        {suggestions.map((suggestion: string, index: number) => (
            <div
                key={index}
                onClick={() => selectSuggestion(index)}
                className={`context-menu-item ${index === selectedIdx ? "selected" : ""}`}
            >
                <p className="unselectable">{suggestion}</p>
         </div>
        ))}
    );
};

export default SuggestionMenu;
