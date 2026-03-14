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
    ChevronUp,
    ChevronDown,
    Save,
} from "lucide-react";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";
import optionCard from "./OptionCard.module.css";

const LayoutSettings = () => {
    const t = useTranslations("layout");
    const tCommon = useTranslations("common");
    const context = useContext(ProjectContext);
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
    } = context;

    const MARGIN_ELEMENTS = [
        "scene",
        "action",
        "character",
        "dialogue",
        "parenthetical",
        "transition",
        "section",
    ] as const;

    // Strip wrapping parentheses for display
    const stripParens = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

    // --- LOCAL STATE ---
    const [localFormat, setLocalFormat] = useState(pageFormat);
    const [localDisplaySceneNumbers, setLocalDisplaySceneNumbers] = useState(displaySceneNumbers);
    const [localSceneNumberOnRight, setLocalSceneNumberOnRight] = useState(sceneNumberOnRight);
    const [localHeadingSpacing, setLocalHeadingSpacing] = useState(sceneHeadingSpacing);
    const [localContdLabel, setLocalContdLabel] = useState(() => stripParens(contdLabel));
    const [localMoreLabel, setLocalMoreLabel] = useState(() => stripParens(moreLabel));

    // Merge persisted margins with defaults
    const initialMargins = useMemo(() => {
        const merged: Record<string, ElementMargin> = {};
        for (const key of MARGIN_ELEMENTS) {
            merged[key] = elementMargins[key] ?? DEFAULT_ELEMENT_MARGINS[key];
        }
        return merged;
    }, [elementMargins]);
    const [localMargins, setLocalMargins] = useState(initialMargins);

    // Merge persisted styles with defaults
    const initialStyles = useMemo(() => {
        const merged: Record<string, ElementStyle> = {};
        for (const key of MARGIN_ELEMENTS) {
            merged[key] = {
                ...(DEFAULT_ELEMENT_STYLES[key] || {}),
                ...(elementStyles[key] || {}),
            };
        }
        return merged;
    }, [elementStyles]);
    const [localStyles, setLocalStyles] = useState(initialStyles);

    // Sync when context changes externally
    useEffect(() => {
        setLocalFormat(pageFormat);
        setLocalDisplaySceneNumbers(displaySceneNumbers);
        setLocalSceneNumberOnRight(sceneNumberOnRight);
        setLocalHeadingSpacing(sceneHeadingSpacing);
        setLocalContdLabel(stripParens(contdLabel));
        setLocalMoreLabel(stripParens(moreLabel));
        setLocalMargins(initialMargins);
        setLocalStyles(initialStyles);
    }, [pageFormat, displaySceneNumbers, sceneNumberOnRight, sceneHeadingSpacing, contdLabel, moreLabel, initialMargins, initialStyles]);

    const hasChanges = useMemo(() => {
        return (
            localFormat !== pageFormat ||
            localDisplaySceneNumbers !== displaySceneNumbers ||
            localSceneNumberOnRight !== sceneNumberOnRight ||
            localHeadingSpacing !== sceneHeadingSpacing ||
            `(${localContdLabel})` !== contdLabel ||
            `(${localMoreLabel})` !== moreLabel ||
            JSON.stringify(localMargins) !== JSON.stringify(initialMargins) ||
            JSON.stringify(localStyles) !== JSON.stringify(initialStyles)
        );
    }, [
        localFormat, pageFormat,
        localDisplaySceneNumbers, displaySceneNumbers,
        localSceneNumberOnRight, sceneNumberOnRight,
        localHeadingSpacing, sceneHeadingSpacing,
        localContdLabel, contdLabel,
        localMoreLabel, moreLabel,
        localMargins, initialMargins,
        localStyles, initialStyles
    ]);

    const handleSave = () => {
        setPageFormat(localFormat);
        setDisplaySceneNumbers(localDisplaySceneNumbers);
        setSceneNumberOnRight(localSceneNumberOnRight);
        setSceneHeadingSpacing(localHeadingSpacing);
        setContdLabel(`(${localContdLabel})`);
        setMoreLabel(`(${localMoreLabel})`);
        setElementMargins(localMargins);
        setElementStyles(localStyles);
    };

    const [selectedElement, setSelectedElement] = useState<(typeof MARGIN_ELEMENTS)[number]>("scene");

    const elementOptions: DropdownOption[] = useMemo(
        () =>
            MARGIN_ELEMENTS.map((el) => ({
                value: el,
                label: <span style={{ fontFamily: "var(--font-screenplay)" }}>{t(`marginElements.${el}`)}</span>,
            })),
        [t],
    );

    const updateLocalMargin = (element: string, side: "left" | "right", value: string) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setLocalMargins((prev) => ({
            ...prev,
            [element]: { ...prev[element], [side]: num },
        }));
    };

    const stepMargin = (element: string, side: "left" | "right", step: number) => {
        const currentValue = localMargins[element]?.[side] ?? DEFAULT_ELEMENT_MARGINS[element][side];
        const newValue = Math.max(0, parseFloat((currentValue + step).toFixed(2)));
        setLocalMargins((prev) => ({
            ...prev,
            [element]: { ...prev[element], [side]: newValue },
        }));
    };

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
                                step="0.05"
                                min="0"
                                value={localMargins[element]?.left ?? ""}
                                onChange={(e) => updateLocalMargin(element, "left", e.target.value)}
                                className={`${sharedStyles.input} ${styles.marginInput}`}
                            />
                            <div className={styles.marginStepGroup}>
                                <button
                                    type="button"
                                    className={styles.marginStepBtn}
                                    onClick={() => stepMargin(element, "left", 0.05)}
                                >
                                    <ChevronUp size={10} />
                                </button>
                                <button
                                    type="button"
                                    className={styles.marginStepBtn}
                                    onClick={() => stepMargin(element, "left", -0.05)}
                                >
                                    <ChevronDown size={10} />
                                </button>
                            </div>
                            <span className={styles.marginUnit}>in</span>
                        </div>
                        <div className={styles.marginInputWrapper} title={t("marginRight")}>
                            <AlignRight size={16} className={styles.marginIcon} />
                            <input
                                type="number"
                                step="0.05"
                                min="0"
                                value={localMargins[element]?.right ?? ""}
                                onChange={(e) => updateLocalMargin(element, "right", e.target.value)}
                                className={`${sharedStyles.input} ${styles.marginInput}`}
                            />
                            <div className={styles.marginStepGroup}>
                                <button
                                    type="button"
                                    className={styles.marginStepBtn}
                                    onClick={() => stepMargin(element, "right", 0.05)}
                                >
                                    <ChevronUp size={10} />
                                </button>
                                <button
                                    type="button"
                                    className={styles.marginStepBtn}
                                    onClick={() => stepMargin(element, "right", -0.05)}
                                >
                                    <ChevronDown size={10} />
                                </button>
                            </div>
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

    const pageFormatOptions: DropdownOption[] = [
        { value: "LETTER", label: 'US Letter (8.5" x 11")' },
        { value: "A4", label: "A4 (210mm x 297mm)" },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("pageFormat")}</label>
                <Dropdown
                    value={localFormat}
                    onChange={(value) => setLocalFormat(value as PageFormat)}
                    options={pageFormatOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
                <p className={sharedStyles.helpText}>
                    {localFormat === "LETTER" && t("pageFormatHelp.letter")}
                    {localFormat === "A4" && t("pageFormatHelp.a4")}
                </p>
            </div>

            <div className={sharedStyles.formGroup}>
                <div className={styles.labelRow}>
                    <div className={styles.marginsSection}>
                        <label className={form.label}>{t("contdTitle")}</label>
                        <div className={styles.contdInputRow}>
                            <input
                                type="text"
                                value={localContdLabel}
                                onChange={(e) => setLocalContdLabel(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                placeholder="CONT'D"
                            />
                        </div>
                    </div>
                    <div className={styles.marginsSection}>
                        <label className={form.label}>{t("moreTitle")}</label>
                        <div className={styles.contdInputRow}>
                            <input
                                type="text"
                                value={localMoreLabel}
                                onChange={(e) => setLocalMoreLabel(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                placeholder="MORE"
                            />
                        </div>
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
                                    className={`${styles.styleBtn} ${localHeadingSpacing === 1 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setLocalHeadingSpacing(1)}
                                    title="1"
                                >
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>1</span>
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${localHeadingSpacing === 1.5 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setLocalHeadingSpacing(1.5)}
                                    title="1.5"
                                >
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>1.5</span>
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${localHeadingSpacing === 2 ? styles.styleBtnActive : ""}`}
                                    onClick={() => setLocalHeadingSpacing(2)}
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
                                    className={`${styles.styleBtn} ${localDisplaySceneNumbers ? styles.styleBtnActive : ""}`}
                                    onClick={() => setLocalDisplaySceneNumbers(!localDisplaySceneNumbers)}
                                    title={t("sceneNumbering")}
                                >
                                    <ArrowLeftToLine size={16} />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.styleBtn} ${localSceneNumberOnRight ? styles.styleBtnActive : ""}`}
                                    onClick={() => setLocalSceneNumberOnRight(!localSceneNumberOnRight)}
                                    title={t("duplicateRight")}
                                    disabled={!localDisplaySceneNumbers}
                                    style={{
                                        opacity: localDisplaySceneNumbers ? 1 : 0.5,
                                        cursor: localDisplaySceneNumbers ? "pointer" : "not-allowed",
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

            <div className={sharedStyles.formActions}>
                <button
                    className={sharedStyles.formBtn}
                    disabled={!hasChanges}
                    onClick={handleSave}
                >
                    <Save size={18} />
                    {tCommon("save")}
                </button>
            </div>
        </div>
    );
};

export default LayoutSettings;
