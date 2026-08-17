"use client";

import { ReactNode, useContext, useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import {
    DEFAULT_ELEMENT_MARGINS,
    DEFAULT_PAGE_MARGINS,
    ElementMargin,
    ElementStyle,
    PageMargin,
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
    CaseSensitive,
    ArrowLeftToLine,
    ArrowRightToLine,
    ArrowUpToLine,
    ArrowDownToLine,
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Save,
    SeparatorHorizontal,
    RotateCcw,
} from "lucide-react";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";
import optionCard from "./OptionCard.module.css";
const MARGIN_ELEMENTS = [
    "scene",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "transition",
    "section",
] as const;

/**
 * A collapsible settings section: a clickable heading (with an optional hint
 * slot) that folds its body away. Defined at module scope so its open/closed
 * state survives the parent's re-renders. The hint is rendered next to the
 * title and stops click propagation so interacting with it doesn't toggle.
 */
const Section = ({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const toggle = () => setOpen((prev) => !prev);
    return (
        <div className={sharedStyles.formGroup}>
            <div
                className={styles.sectionHeader}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={toggle}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                    }
                }}
            >
                <span className={sharedStyles.sectionTitle}>{title}</span>
                <ChevronRight size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
            </div>
            {open && <div className={styles.sectionBody}>{children}</div>}
        </div>
    );
};

const LayoutSettings = () => {
    const t = useTranslations("layout");
    const tCommon = useTranslations("common");
    const context = useContext(ProjectContext);
    const {
        pageFormat,
        setPageFormat,
        pageMargins,
        setPageMargins,
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
        showContdDialogue,
        setShowContdDialogue,
        showContdPageBreak,
        setShowContdPageBreak,
        headerLeft,
        setHeaderLeft,
        headerMiddle,
        setHeaderMiddle,
        headerRight,
        setHeaderRight,
        showFirstPageHeader,
        setShowFirstPageHeader,
        footerLeft,
        setFooterLeft,
        footerMiddle,
        setFooterMiddle,
        footerRight,
        setFooterRight,
        showFirstPageFooter,
        setShowFirstPageFooter,
        elementMargins,
        setElementMargins,
        elementStyles,
        setElementStyles,
    } = context;

    // Strip wrapping parentheses for display
    const stripParens = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

    // --- LOCAL STATE ---
    const [localFormat, setLocalFormat] = useState(pageFormat);
    const initialPageMargins = useMemo<PageMargin>(() => ({ ...DEFAULT_PAGE_MARGINS, ...pageMargins }), [pageMargins]);
    const [localPageMargins, setLocalPageMargins] = useState<PageMargin>(initialPageMargins);
    const [localDisplaySceneNumbers, setLocalDisplaySceneNumbers] = useState(displaySceneNumbers);
    const [localSceneNumberOnRight, setLocalSceneNumberOnRight] = useState(sceneNumberOnRight);
    const [localHeadingSpacing, setLocalHeadingSpacing] = useState(sceneHeadingSpacing);
    const [localContdLabel, setLocalContdLabel] = useState(() => stripParens(contdLabel));
    const [localMoreLabel, setLocalMoreLabel] = useState(() => stripParens(moreLabel));
    const [localShowContdDialogue, setLocalShowContdDialogue] = useState(showContdDialogue);
    const [localShowContdPageBreak, setLocalShowContdPageBreak] = useState(showContdPageBreak);
    const [localHeaderLeft, setLocalHeaderLeft] = useState(headerLeft);
    const [localHeaderMiddle, setLocalHeaderMiddle] = useState(headerMiddle);
    const [localHeaderRight, setLocalHeaderRight] = useState(headerRight);
    const [localShowFirstPageHeader, setLocalShowFirstPageHeader] = useState(showFirstPageHeader);
    const [localFooterLeft, setLocalFooterLeft] = useState(footerLeft);
    const [localFooterMiddle, setLocalFooterMiddle] = useState(footerMiddle);
    const [localFooterRight, setLocalFooterRight] = useState(footerRight);
    const [localShowFirstPageFooter, setLocalShowFirstPageFooter] = useState(showFirstPageFooter);

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
        const sync = () => {
            setLocalFormat(pageFormat);
            setLocalPageMargins(initialPageMargins);
            setLocalDisplaySceneNumbers(displaySceneNumbers);
            setLocalSceneNumberOnRight(sceneNumberOnRight);
            setLocalHeadingSpacing(sceneHeadingSpacing);
            setLocalContdLabel(stripParens(contdLabel));
            setLocalMoreLabel(stripParens(moreLabel));
            setLocalShowContdDialogue(showContdDialogue);
            setLocalShowContdPageBreak(showContdPageBreak);
            setLocalHeaderLeft(headerLeft);
            setLocalHeaderMiddle(headerMiddle);
            setLocalHeaderRight(headerRight);
            setLocalShowFirstPageHeader(showFirstPageHeader);
            setLocalFooterLeft(footerLeft);
            setLocalFooterMiddle(footerMiddle);
            setLocalFooterRight(footerRight);
            setLocalShowFirstPageFooter(showFirstPageFooter);
            setLocalMargins(initialMargins);
            setLocalStyles(initialStyles);
        };
        sync();
    }, [
        pageFormat,
        initialPageMargins,
        displaySceneNumbers,
        sceneNumberOnRight,
        sceneHeadingSpacing,
        contdLabel,
        moreLabel,
        showContdDialogue,
        showContdPageBreak,
        headerLeft,
        headerMiddle,
        headerRight,
        showFirstPageHeader,
        footerLeft,
        footerMiddle,
        footerRight,
        showFirstPageFooter,
        initialMargins,
        initialStyles,
    ]);

    const hasChanges = useMemo(() => {
        return (
            localFormat !== pageFormat ||
            JSON.stringify(localPageMargins) !== JSON.stringify(initialPageMargins) ||
            localDisplaySceneNumbers !== displaySceneNumbers ||
            localSceneNumberOnRight !== sceneNumberOnRight ||
            localHeadingSpacing !== sceneHeadingSpacing ||
            `(${localContdLabel})` !== contdLabel ||
            `(${localMoreLabel})` !== moreLabel ||
            localShowContdDialogue !== showContdDialogue ||
            localShowContdPageBreak !== showContdPageBreak ||
            localHeaderLeft !== headerLeft ||
            localHeaderMiddle !== headerMiddle ||
            localHeaderRight !== headerRight ||
            localShowFirstPageHeader !== showFirstPageHeader ||
            localFooterLeft !== footerLeft ||
            localFooterMiddle !== footerMiddle ||
            localFooterRight !== footerRight ||
            localShowFirstPageFooter !== showFirstPageFooter ||
            JSON.stringify(localMargins) !== JSON.stringify(initialMargins) ||
            JSON.stringify(localStyles) !== JSON.stringify(initialStyles)
        );
    }, [
        localFormat,
        pageFormat,
        localPageMargins,
        initialPageMargins,
        localDisplaySceneNumbers,
        displaySceneNumbers,
        localSceneNumberOnRight,
        sceneNumberOnRight,
        localHeadingSpacing,
        sceneHeadingSpacing,
        localContdLabel,
        contdLabel,
        localMoreLabel,
        moreLabel,
        localShowContdDialogue,
        showContdDialogue,
        localShowContdPageBreak,
        showContdPageBreak,
        localHeaderLeft,
        headerLeft,
        localHeaderMiddle,
        headerMiddle,
        localHeaderRight,
        headerRight,
        localShowFirstPageHeader,
        showFirstPageHeader,
        localFooterLeft,
        footerLeft,
        localFooterMiddle,
        footerMiddle,
        localFooterRight,
        footerRight,
        localShowFirstPageFooter,
        showFirstPageFooter,
        localMargins,
        initialMargins,
        localStyles,
        initialStyles,
    ]);

    const handleReset = () => {
        setLocalFormat("LETTER");
        setLocalPageMargins({ ...DEFAULT_PAGE_MARGINS });
        setLocalDisplaySceneNumbers(false);
        setLocalSceneNumberOnRight(false);
        setLocalHeadingSpacing(1);
        setLocalContdLabel("CONT'D");
        setLocalMoreLabel("MORE");
        setLocalShowContdDialogue(true);
        setLocalShowContdPageBreak(true);
        setLocalHeaderLeft("");
        setLocalHeaderMiddle("");
        setLocalHeaderRight("#.");
        setLocalShowFirstPageHeader(false);
        setLocalFooterLeft("");
        setLocalFooterMiddle("");
        setLocalFooterRight("");
        setLocalShowFirstPageFooter(false);
        const defaultMargins: Record<string, ElementMargin> = {};
        for (const key of MARGIN_ELEMENTS) {
            defaultMargins[key] = { ...DEFAULT_ELEMENT_MARGINS[key] };
        }
        setLocalMargins(defaultMargins);
        const defaultStyles: Record<string, ElementStyle> = {};
        for (const key of MARGIN_ELEMENTS) {
            defaultStyles[key] = { ...(DEFAULT_ELEMENT_STYLES[key] || {}) };
        }
        setLocalStyles(defaultStyles);
    };

    const handleSave = () => {
        setPageFormat(localFormat);
        setPageMargins(localPageMargins);
        setDisplaySceneNumbers(localDisplaySceneNumbers);
        setSceneNumberOnRight(localSceneNumberOnRight);
        setSceneHeadingSpacing(localHeadingSpacing);
        setContdLabel(`(${localContdLabel})`);
        setMoreLabel(`(${localMoreLabel})`);
        setShowContdDialogue(localShowContdDialogue);
        setShowContdPageBreak(localShowContdPageBreak);
        setHeaderLeft(localHeaderLeft);
        setHeaderMiddle(localHeaderMiddle);
        setHeaderRight(localHeaderRight);
        setShowFirstPageHeader(localShowFirstPageHeader);
        setFooterLeft(localFooterLeft);
        setFooterMiddle(localFooterMiddle);
        setFooterRight(localFooterRight);
        setShowFirstPageFooter(localShowFirstPageFooter);
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

    const updatePageMargin = (side: keyof PageMargin, value: string) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setLocalPageMargins((prev) => ({ ...prev, [side]: num }));
    };

    const stepPageMargin = (side: keyof PageMargin, step: number) => {
        const currentValue = localPageMargins[side];
        const newValue = Math.max(0, parseFloat((currentValue + step).toFixed(2)));
        setLocalPageMargins((prev) => ({ ...prev, [side]: newValue }));
    };

    const updateLocalStyle = (e: React.MouseEvent, element: string, styleKey: keyof ElementStyle, value: ElementStyle[keyof ElementStyle]) => {
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
                            <ArrowLeftToLine size={16} className={styles.marginIcon} />
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
                            <ArrowRightToLine size={16} className={styles.marginIcon} />
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
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.uppercase ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "uppercase", !currentStyle.uppercase)}
                            title={t("uppercase")}
                        >
                            <CaseSensitive size={16} />
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

                <div className={styles.marginRow}>
                    <span className={styles.marginLabel}>{t("startNewPage")}</span>
                    <div className={styles.styleGroup}>
                        <button
                            type="button"
                            className={`${styles.styleBtn} ${currentStyle.startNewPage ? styles.styleBtnActive : ""}`}
                            onClick={(e) => updateLocalStyle(e, element, "startNewPage", !currentStyle.startNewPage)}
                            title={t("startNewPage")}
                        >
                            <SeparatorHorizontal size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // The CONT'D label serves both continuation cases, so it stays editable as
    // long as either one of them still renders it.
    const contdLabelUsed = localShowContdDialogue || localShowContdPageBreak;

    const pageFormatOptions: DropdownOption[] = [
        { value: "LETTER", label: 'US Letter (8.5" x 11")' },
        { value: "A4", label: "A4 (210mm x 297mm)" },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            <Section title={t("pageFormat")}>
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
            </Section>

            <Section title={t("pageMargins")}>
                <div className={styles.marginsSection}>
                    <div className={styles.marginRow}>
                        <span className={styles.marginLabel}>{t("vertical")}</span>
                        <div className={styles.marginInputs}>
                            <div className={styles.marginInputWrapper} title={t("marginTop")}>
                                <ArrowUpToLine size={16} className={styles.marginIcon} />
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={localPageMargins.top}
                                    onChange={(e) => updatePageMargin("top", e.target.value)}
                                    className={`${sharedStyles.input} ${styles.marginInput}`}
                                />
                                <div className={styles.marginStepGroup}>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("top", 0.05)}
                                    >
                                        <ChevronUp size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("top", -0.05)}
                                    >
                                        <ChevronDown size={10} />
                                    </button>
                                </div>
                                <span className={styles.marginUnit}>in</span>
                            </div>
                            <div className={styles.marginInputWrapper} title={t("marginBottom")}>
                                <ArrowDownToLine size={16} className={styles.marginIcon} />
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={localPageMargins.bottom}
                                    onChange={(e) => updatePageMargin("bottom", e.target.value)}
                                    className={`${sharedStyles.input} ${styles.marginInput}`}
                                />
                                <div className={styles.marginStepGroup}>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("bottom", 0.05)}
                                    >
                                        <ChevronUp size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("bottom", -0.05)}
                                    >
                                        <ChevronDown size={10} />
                                    </button>
                                </div>
                                <span className={styles.marginUnit}>in</span>
                            </div>
                        </div>
                    </div>
                    <div className={styles.marginRow}>
                        <span className={styles.marginLabel}>{t("horizontal")}</span>
                        <div className={styles.marginInputs}>
                            <div className={styles.marginInputWrapper} title={t("marginLeft")}>
                                <ArrowLeftToLine size={16} className={styles.marginIcon} />
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={localPageMargins.left}
                                    onChange={(e) => updatePageMargin("left", e.target.value)}
                                    className={`${sharedStyles.input} ${styles.marginInput}`}
                                />
                                <div className={styles.marginStepGroup}>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("left", 0.05)}
                                    >
                                        <ChevronUp size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("left", -0.05)}
                                    >
                                        <ChevronDown size={10} />
                                    </button>
                                </div>
                                <span className={styles.marginUnit}>in</span>
                            </div>
                            <div className={styles.marginInputWrapper} title={t("marginRight")}>
                                <ArrowRightToLine size={16} className={styles.marginIcon} />
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={localPageMargins.right}
                                    onChange={(e) => updatePageMargin("right", e.target.value)}
                                    className={`${sharedStyles.input} ${styles.marginInput}`}
                                />
                                <div className={styles.marginStepGroup}>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("right", 0.05)}
                                    >
                                        <ChevronUp size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.marginStepBtn}
                                        onClick={() => stepPageMargin("right", -0.05)}
                                    >
                                        <ChevronDown size={10} />
                                    </button>
                                </div>
                                <span className={styles.marginUnit}>in</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title={t("continuedLabels")}>
                <div
                    className={`${optionCard.optionCard} ${localShowContdDialogue ? optionCard.active : ""}`}
                    onClick={() => setLocalShowContdDialogue(!localShowContdDialogue)}
                >
                    <div className={optionCard.checkbox}>
                        {localShowContdDialogue && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("contdOnDialogue")}</span>
                        <span className={optionCard.optionDesc}>{t("contdOnDialogueDesc")}</span>
                    </div>
                </div>

                <div
                    className={`${optionCard.optionCard} ${localShowContdPageBreak ? optionCard.active : ""}`}
                    onClick={() => setLocalShowContdPageBreak(!localShowContdPageBreak)}
                >
                    <div className={optionCard.checkbox}>
                        {localShowContdPageBreak && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("contdOnPageBreak")}</span>
                        <span className={optionCard.optionDesc}>{t("contdOnPageBreakDesc")}</span>
                    </div>
                </div>

                {/* The labels themselves are only reachable through the toggles
                    above, so each input dims once nothing renders it. */}
                <div className={styles.labelRow}>
                    <div className={`${styles.marginsSection} ${contdLabelUsed ? "" : styles.labelDisabled}`}>
                        <span className={styles.marginLabel}>{t("contdTitle")}</span>
                        <div className={styles.contdInputRow}>
                            <input
                                type="text"
                                value={localContdLabel}
                                onChange={(e) => setLocalContdLabel(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                placeholder="CONT'D"
                                disabled={!contdLabelUsed}
                            />
                        </div>
                    </div>
                    <div className={`${styles.marginsSection} ${localShowContdPageBreak ? "" : styles.labelDisabled}`}>
                        <span className={styles.marginLabel}>{t("moreTitle")}</span>
                        <div className={styles.contdInputRow}>
                            <input
                                type="text"
                                value={localMoreLabel}
                                onChange={(e) => setLocalMoreLabel(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                placeholder="MORE"
                                disabled={!localShowContdPageBreak}
                            />
                        </div>
                    </div>
                </div>
            </Section>

            <Section title={t("headerAndFooter")}>
                <p className={sharedStyles.helpText}>{t("pageHeaderHint")}</p>

                <div className={styles.hfGroup}>
                    <span className={styles.hfTitle}>{t("header")}</span>
                    <div className={styles.labelRow}>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "left" }} title={t("headerLeft")}>
                                <AlignLeft size={16} />
                            </span>
                            <input
                                type="text"
                                value={localHeaderLeft}
                                onChange={(e) => setLocalHeaderLeft(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                            />
                        </div>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "center" }} title={t("headerMiddle")}>
                                <AlignCenter size={16} />
                            </span>
                            <input
                                type="text"
                                value={localHeaderMiddle}
                                onChange={(e) => setLocalHeaderMiddle(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                style={{ textAlign: "center" }}
                            />
                        </div>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "right" }} title={t("headerRight")}>
                                <AlignRight size={16} />
                            </span>
                            <input
                                type="text"
                                value={localHeaderRight}
                                onChange={(e) => setLocalHeaderRight(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                style={{ textAlign: "right" }}
                            />
                        </div>
                    </div>
                    <div
                        className={`${optionCard.optionCard} ${styles.hfToggle} ${localShowFirstPageHeader ? optionCard.active : ""}`}
                        onClick={() => setLocalShowFirstPageHeader(!localShowFirstPageHeader)}
                    >
                        <div className={optionCard.checkbox}>
                            {localShowFirstPageHeader && <div className={optionCard.checkInner} />}
                        </div>
                        <span className={optionCard.optionTitle}>{t("showFirstPageHeader")}</span>
                    </div>
                </div>

                <div className={styles.hfGroup}>
                    <span className={styles.hfTitle}>{t("footer")}</span>
                    <div className={styles.labelRow}>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "left" }} title={t("footerLeft")}>
                                <AlignLeft size={16} />
                            </span>
                            <input
                                type="text"
                                value={localFooterLeft}
                                onChange={(e) => setLocalFooterLeft(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                            />
                        </div>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "center" }} title={t("footerMiddle")}>
                                <AlignCenter size={16} />
                            </span>
                            <input
                                type="text"
                                value={localFooterMiddle}
                                onChange={(e) => setLocalFooterMiddle(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                style={{ textAlign: "center" }}
                            />
                        </div>
                        <div className={styles.marginsSection}>
                            <span className={styles.marginLabel} style={{ textAlign: "right" }} title={t("footerRight")}>
                                <AlignRight size={16} />
                            </span>
                            <input
                                type="text"
                                value={localFooterRight}
                                onChange={(e) => setLocalFooterRight(e.target.value)}
                                className={`${sharedStyles.input} ${styles.input}`}
                                style={{ textAlign: "right" }}
                            />
                        </div>
                    </div>
                    <div
                        className={`${optionCard.optionCard} ${styles.hfToggle} ${localShowFirstPageFooter ? optionCard.active : ""}`}
                        onClick={() => setLocalShowFirstPageFooter(!localShowFirstPageFooter)}
                    >
                        <div className={optionCard.checkbox}>
                            {localShowFirstPageFooter && <div className={optionCard.checkInner} />}
                        </div>
                        <span className={optionCard.optionTitle}>{t("showFirstPageFooter")}</span>
                    </div>
                </div>
            </Section>

            <Section title={t("elements")}>
                <Dropdown
                    value={selectedElement}
                    onChange={(value) => setSelectedElement(value as (typeof MARGIN_ELEMENTS)[number])}
                    options={elementOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
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
            </Section>

            <div className={sharedStyles.formActions}>
                <button className={sharedStyles.formBtn} onClick={handleReset}>
                    <RotateCcw size={18} />
                    {tCommon("resetDefaults")}
                </button>
                <button className={sharedStyles.formBtn} disabled={!hasChanges} onClick={handleSave}>
                    <Save size={18} />
                    {tCommon("save")}
                </button>
            </div>
        </div>
    );
};

export default LayoutSettings;
