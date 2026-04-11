"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useViewContext } from "@src/context/ViewContext";
import styles from "./SplitPanelContainer.module.css";

const DragHandle = () => {
    const { setSplitRatio } = useViewContext();
    const [isDragging, setIsDragging] = useState(false);
    const gridRef = useRef<HTMLElement | null>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        // Cache the grid container (two levels up: handle → order wrapper → grid)
        const grid = (e.currentTarget as HTMLElement).parentElement?.parentElement;
        if (grid) gridRef.current = grid;
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const grid = gridRef.current;
            if (!grid) return;

            const rect = grid.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.min(0.8, Math.max(0.2, x / rect.width));
            setSplitRatio(ratio);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, setSplitRatio]);

    return (
        <>
            <div
                className={`${styles.drag_handle} ${isDragging ? styles.drag_handle_active : ""}`}
                onMouseDown={onMouseDown}
            />
            {isDragging && <div className={styles.drag_overlay} />}
        </>
    );
};

export default DragHandle;
