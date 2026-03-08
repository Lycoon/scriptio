"use client";

import { useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import {
    DEFAULT_ELEMENT_MARGINS,
    ElementMargin,
    ElementStyle,
    DEFAULT_ELEMENT_STYLES,
} from "@src/lib/project/project-state";
import { PageFormat } from "@src/lib/utils/enums";
import {
    AlignLeft,
    AlignRight,
    Bold,
    Italic,
    Underline,
    AlignCenter,
    ArrowLeftToLine,
    ArrowRightToLine,
} from "lucide-react";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";
import optionCard from "./OptionCard.module.css";

const LayoutSettings = () => {
    const t = useTranslations("layout");
    const tCommon = useTranslations("common");
    const {
        pageFormat,
        setPageFormat,
        displaySceneNumbers,
        setDisplaySceneNumbers,
        sceneHeadingSpacing,
        setSceneHeadingSpacing,
        sceneNumberOnRight,
        setSceneNumberOnRight,
        contdLabel,
        setContdLabel,
        moreLabel,
        setMoreLabel,
        elementMargins,
        setElementMargins,
        elementStyles,
        setElementStyles,
    } = useContext(ProjectContext);

    // Strip wrapping parentheses for display — the system stores "(CONT'D)" but the
    // user should only type the inner text; parentheses are added back on commit.
    const stripParens = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

    // Local state for the continuation input to avoid triggering editor.commands.focus()
    // on every keystroke (which steals focus from the input and causes freezes)
    const [localContdLabel, setLocalContdLabel] = useState(() => stripParens(contdLabel));
    const [localMoreLabel, setLocalMoreLabel] = useState(() => stripParens(moreLabel));

    const hasContdChanges = `(${localContdLabel})` !== contdLabel;
    const hasMoreChanges = `(${localMoreLabel})` !== moreLabel;

    const commitContdLabel = () => {
        if (hasContdChanges) setContdLabel(`(${localContdLabel})`);
    };

    const commitMoreLabel = () => {
        if (hasMoreChanges) setMoreLabel(`(${localMoreLabel})`);
    };

    // Keep local state in sync when the context value changes externally (e.g. collaboration)
    useEffect(() => {
        setLocalContdLabel(stripParens(contdLabel));
    }, [contdLabel]);

    useEffect(() => {
        setLocalMoreLabel(stripParens(moreLabel));
    }, [moreLabel]);

    const MARGIN_ELEMENTS = [
        "scene",
        "action",
        "character",
        "dialogue",
        "parenthetical",
        "transition",
        "section",
    ] as const;
    const [selectedElement, setSelectedElement] = useState<(typeof MARGIN_ELEMENTS)[number]>("scene");

    const elementOptions: DropdownOption[] = useMemo(
        () =>
            MARGIN_ELEMENTS.map((el) => ({
                value: el,
                label: <span style={{ fontFamily: "var(--font-screenplay)" }}>{t(`marginElements.${el}`)}</span>,
            })),
        [t],
    );

    // Merge persisted margins with defaults so inputs always show a value
    const mergedMargins = useMemo(() => {
        const merged: Record<string, ElementMargin> = {};
        for (const key of MARGIN_ELEMENTS) {
            merged[key] = elementMargins[key] ?? DEFAULT_ELEMENT_MARGINS[key];
        }
        return merged;
    }, [elementMargins]);

    const [localMargins, setLocalMargins] = useState(mergedMargins);

    // Sync local state when context changes externally (e.g. collaboration)
    useEffect(() => {
        setLocalMargins(mergedMargins);
    }, [mergedMargins]);

    const updateLocalMargin = (element: string, side: "left" | "right", value: string) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setLocalMargins((prev) => ({
            ...prev,
            [element]: { ...prev[element], [side]: num },
        }));
    };

    const commitMargins = () => {
        setElementMargins(localMargins);
    };

    const mergedStyles = useMemo(() => {
        const merged: Record<string, ElementStyle> = {};
        for (const key of MARGIN_ELEMENTS) {
            merged[key] = {
                ...(DEFAULT_ELEMENT_STYLES[key] || {}),
                ...(elementStyles[key] || {}),
            };
        }
        return merged;
    }, [elementStyles]);

    const [localStyles, setLocalStyles] = useState(mergedStyles);

    useEffect(() => {
        setLocalStyles(mergedStyles);
    }, [mergedStyles]);

    const updateLocalStyle = (e: React.MouseEvent, element: string, styleKey: keyof ElementStyle, value: any) => {
        e.preventDefault();
        e.stopPropagation();

        const currentStyle = {
            ...(DEFAULT_ELEMENT_STYLES[element] || {}),
            ...(localStyles[element] || {}),
        };

        const newStyles = {
            ...localStyles,
            [element]: { ...currentStyle, [styleKey]: value },
        };
        setLocalStyles(newStyles);
        setElementStyles(newStyles);
    };

    const renderElementConfig = (element: (typeof MARGIN_ELEMENTS)[number]) => {
        const currentStyle = {
            ...(DEFAULT_ELEMENT_STYLES[element] || {}),
            ...(localStyles[element] || {}),
        };

        return (
            <div className={styles.marginsSection}>
                <div className={styles.marginRow}>
                    <span className={styles.marginLabel}>{t("margins")}</span>
                    <div className={styles.marginInputs}>
                        <div className={styles.marginInputWrapper} title={t("marginLeft")}>
                            <AlignLeft size={16} className={styles.marginIcon} />
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={localMargins[element]?.left ?? ""}
                                onChange={(e) => updateLocalMargin(element, "left", e.target.value)}
                                onBlur={commitMargins}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitMargins();
                                }}
                                className={`${sharedStyles.input} ${styles.marginInput}`}
                            />
                            <span className={styles.marginUnit}>in</span>
                        </div>
                        <div className={styles.marginInputWrapper} title={t("marginRight")}>
                            <AlignRight size={16} className={styles.marginIcon} />
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={localMargins[element]?.right ?? ""}
                                onChange={(e) => updateLocalMargin(element, "right", e.target.value)}
                                onBlur={commitMargins}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitMargins();
                                }}
                                className={`${sharedStyles.input} ${styles.marginInput}`}
                            />
                            <span className={styles.marginUnit}>in</span>
                        </div>
                    </div>
                </div>

                <div className={styles.marginRow}>
                    <span className={styles.marginLabel}>{t("style")}</span>
                    <div className={styles.styleGroup}>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.bold ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "bold", !currentStyle.bold)}
                            title={t("bold")}
                        >
                            <Bold size={16} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.italic ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "italic", !currentStyle.italic)}
                            title={t("italic")}
                        >
                            <Italic size={16} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.underline ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "underline", !currentStyle.underline)}
                            title={t("underline")}
                        >
                            <Underline size={16} />
                        </button>
                    </div>
                </div>

                <div className={styles.marginRow}>
                    <span className={styles.marginLabel}>{t("alignment")}</span>
                    <div className={styles.styleGroup}>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.align === "left" || !currentStyle.align ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "align", "left")}
                            title={t("alignLeft")}
                        >
                            <AlignLeft size={16} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.align === "center" ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "align", "center")}
                            title={t("alignCenter")}
                        >
                            <AlignCenter size={16} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.align === "right" ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "align", "right")}
                            title={t("alignRight")}
                        >
                            <AlignRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handleFormatChange = (newFormat: PageFormat) => {
        setPageFormat(newFormat);
    };

    const pageFormatOptions: DropdownOption[] = [
        { value: "LETTER", label: 'US Letter (8.5" x 11")' },
        { value: "A4", label: "A4 (210mm x 297mm)" },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("pageFormat")}</label>
                <Dropdown
                    value={pageFormat}
                    onChange={(value) => handleFormatChange(value as PageFormat)}
                    options={pageFormatOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
                <p className={sharedStyles.helpText}>
                    {pageFormat === "LETTER" && t("pageFormatHelp.letter")}
                    {pageFormat === "A4" && t("pageFormatHelp.a4")}
                </p>
            </div>

            <div className={sharedStyles.formGroup}>
                <div className={styles.marginsSection}>
                    <label className={form.label}>{t("contdTitle")}</label>
                    <div className={styles.contdInputRow}>
                        <input
                            type="text"
                            value={localContdLabel}
                            onChange={(e) => setLocalContdLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitContdLabel();
                            }}
                            className={`${sharedStyles.input} ${styles.input}`}
                            placeholder="CONT'D"
                        />
                        <button
                            className={`${styles.contdConfirmBtn} ${hasContdChanges ? styles.contdConfirmBtnActive : ""}`}
                            disabled={!hasContdChanges}
                            onClick={commitContdLabel}
                            title={t("contdTitle")}
                        >
                            {tCommon("save")}
                        </button>
                    </div>
                </div>
                <div className={styles.marginsSection}>
                    <label className={form.label}>{t("moreTitle")}</label>
                    <div className={styles.contdInputRow}>
                        <input
                            type="text"
                            value={localMoreLabel}
                            onChange={(e) => setLocalMoreLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitMoreLabel();
                            }}
                            className={`${sharedStyles.input} ${styles.input}`}
                            placeholder="MORE"
                        />
                        <button
                            className={`${styles.contdConfirmBtn} ${hasMoreChanges ? styles.contdConfirmBtnActive : ""}`}
                            disabled={!hasMoreChanges}
                            onClick={commitMoreLabel}
                            title={t("moreTitle")}
                        >
                            {tCommon("save")}
                        </button>
                    </div>
                </div>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("elements")}</label>
                <Dropdown
                    value={selectedElement}
                    onChange={(value) => setSelectedElement(value as (typeof MARGIN_ELEMENTS)[number])}
                    options={elementOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
            </div>

            <div className={sharedStyles.formGroup}>
                {selectedElement === "scene" && (
                    <div className={styles.marginsSection}>
                        <div className={styles.marginRow}>
                            <span className={styles.marginLabel}>{t("sceneSpacing")}</span>
                            <div className={styles.styleGroup}>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${sceneHeadingSpacing === 1 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setSceneHeadingSpacing(1)}
                                    title="1"
                                >
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>1</span>
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${sceneHeadingSpacing === 1.5 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setSceneHeadingSpacing(1.5)}
                                    title="1.5"
                                >
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>1.5</span>
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${sceneHeadingSpacing === 2 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setSceneHeadingSpacing(2)}
                                    title="2"
                                >
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>2</span>
                                </button>
                            </div>
                        </div>

                        <div className={styles.marginRow}>
                            <span className={styles.marginLabel}>{t("sceneNumbering")}</span>
                            <div className={styles.styleGroup}>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${displaySceneNumbers ? styles.styleBtnActive : ""}`}
                                    onClick={() => setDisplaySceneNumbers(!displaySceneNumbers)}
                                    title={t("sceneNumbering")}
                                >
                                    <ArrowLeftToLine size={16} />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${sceneNumberOnRight ? styles.styleBtnActive : ""}`}
                                    onClick={() => setSceneNumberOnRight(!sceneNumberOnRight)}
                                    title={t("duplicateRight")}
                                    disabled={!displaySceneNumbers}
                                    style={{
                                        opacity: displaySceneNumbers ? 1 : 0.5,
                                        cursor: displaySceneNumbers ? "pointer" : "not-allowed",
                                    }}
                                >
                                    <ArrowRightToLine size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {renderElementConfig(selectedElement)}
            </div>
        </div>
    );
};

export default LayoutSettings;
