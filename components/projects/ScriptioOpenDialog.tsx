"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, GitMerge, Check, X } from "lucide-react";

import {
    acceptScriptioAsNewProject,
    acceptScriptioMerge,
    dismissScriptioOpen,
    getPendingScriptioOpen,
    subscribeScriptioOpen,
} from "@src/lib/import/scriptio-file-open";
import { CURRENT_PROJECT_VERSION } from "@src/lib/project/migrations/project-migrations";
import { getCachedProject } from "@src/lib/persistence/storage-provider/local-persistence";
import { useCookieUser, useIsPro } from "@src/lib/utils/hooks";
import { useAppNavigation } from "@src/lib/utils/navigation";

import ProjectMigrationErrorDialog from "./ProjectMigrationErrorDialog";
import styles from "./ProjectMigrationErrorDialog.module.css";

/**
 * Asks what to do with a `.scriptio` the user just opened.
 *
 * The plan behind it was computed before anything was written, so each case gets
 * copy that names the actual situation rather than a generic "import?" — which
 * matters most for the case that looks alarming and isn't: merging a file into a
 * project cannot lose either side's work, because the underlying operation is a
 * CRDT union, not a replace.
 *
 * `new-project` is handled without showing anything: with no local copy to
 * reconcile against, opening a file just means opening it, and a dialog would be
 * a question with one answer.
 */
const ScriptioOpenDialog = () => {
    const t = useTranslations("popup");
    const pending = useSyncExternalStore(subscribeScriptioOpen, getPendingScriptioOpen, () => null);
    const { user } = useCookieUser();
    const { isPro } = useIsPro();
    const { goToProject } = useAppNavigation();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Titles of the local projects named by the plan, for the copy. */
    const [titles, setTitles] = useState<Record<string, string>>({});

    const plan = pending?.plan;

    // Resolve the titles the copy needs. Ids are meaningless to the user, and
    // "Update Untitled?" is a fair bit clearer than "Update 8f3c-…?".
    useEffect(() => {
        if (!plan) return;
        const ids =
            plan.kind === "ambiguous"
                ? plan.projectIds
                : "projectId" in plan
                  ? [plan.projectId]
                  : [];
        if (ids.length === 0) return;

        let cancelled = false;
        (async () => {
            const resolved: Record<string, string> = {};
            for (const id of ids) {
                const project = await getCachedProject(id);
                if (project) resolved[id] = project.title;
            }
            if (!cancelled) setTitles(resolved);
        })();
        return () => {
            cancelled = true;
        };
    }, [plan]);

    const run = useCallback(async (action: () => Promise<string>) => {
        setBusy(true);
        setError(null);
        try {
            const projectId = await action();
            goToProject(projectId);
        } catch (e) {
            console.error("[ScriptioOpenDialog] action failed:", e);
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
        }
    }, [goToProject]);

    // Nothing to ask about: no local project shares this file's lineage, so
    // create one and go there. `fork: false` preserves the file's lineage, which
    // is what makes the sender's *next* export merge into this project rather
    // than arrive as yet another copy.
    //
    // The archive itself is the guard against running twice — StrictMode's double
    // effect (and any re-render before the promise settles) would otherwise
    // create two projects from one file.
    const autoCreatedRef = useRef<ArrayBuffer | null>(null);
    useEffect(() => {
        if (plan?.kind !== "new-project" || !pending) return;
        if (autoCreatedRef.current === pending.bytes) return;
        autoCreatedRef.current = pending.bytes;

        let cancelled = false;
        acceptScriptioAsNewProject(false, user, isPro)
            .then((projectId) => {
                if (!cancelled) goToProject(projectId);
            })
            .catch((e) => {
                console.error("[ScriptioOpenDialog] could not open the file:", e);
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, [plan, pending, user, isPro, goToProject]);

    if (!pending || !plan || plan.kind === "new-project") return null;

    if (plan.kind === "future-version") {
        return (
            <ProjectMigrationErrorDialog
                outcome={{
                    kind: "future-version",
                    storedVersion: plan.fileVersion,
                    expected: CURRENT_PROJECT_VERSION,
                }}
            />
        );
    }

    const titleOf = (id: string) => titles[id] ?? t("scriptioOpen.untitledProject");
    const openAsNew = (fork: boolean) => run(() => acceptScriptioAsNewProject(fork, user, isPro));

    const newProjectButton = (fork: boolean) => (
        <button
            className={`${styles.btn} ${styles.secondaryBtn}`}
            onClick={() => openAsNew(fork)}
            disabled={busy}
        >
            <FilePlus2 size={16} />
            {t("scriptioOpen.openAsNew")}
        </button>
    );

    const cancelButton = (
        <button className={`${styles.btn} ${styles.secondaryBtn}`} onClick={dismissScriptioOpen} disabled={busy}>
            <X size={16} />
            {t("scriptioOpen.cancel")}
        </button>
    );

    const body = () => {
        switch (plan.kind) {
            case "already-current":
                return {
                    description: t("scriptioOpen.alreadyCurrent"),
                    actions: (
                        <button
                            className={`${styles.btn} ${styles.primaryBtn}`}
                            onClick={dismissScriptioOpen}
                        >
                            <Check size={16} />
                            {t("scriptioOpen.ok")}
                        </button>
                    ),
                };
            case "fast-forward":
                return {
                    description: t("scriptioOpen.fastForward", { project: titleOf(plan.projectId) }),
                    actions: (
                        <>
                            <button
                                className={`${styles.btn} ${styles.primaryBtn}`}
                                onClick={() => run(() => acceptScriptioMerge(plan.projectId))}
                                disabled={busy}
                            >
                                <GitMerge size={16} />
                                {t("scriptioOpen.update")}
                            </button>
                            {newProjectButton(true)}
                            {cancelButton}
                        </>
                    ),
                };
            case "diverged":
                return {
                    description: t("scriptioOpen.diverged", { project: titleOf(plan.projectId) }),
                    note: t("scriptioOpen.divergedSnapshot"),
                    actions: (
                        <>
                            <button
                                className={`${styles.btn} ${styles.primaryBtn}`}
                                onClick={() => run(() => acceptScriptioMerge(plan.projectId))}
                                disabled={busy}
                            >
                                <GitMerge size={16} />
                                {t("scriptioOpen.merge")}
                            </button>
                            {newProjectButton(true)}
                            {cancelButton}
                        </>
                    ),
                };
            case "no-lineage":
                return {
                    description: t("scriptioOpen.noLineage"),
                    actions: (
                        <>
                            {newProjectButton(false)}
                            {cancelButton}
                        </>
                    ),
                };
            case "ambiguous":
                return {
                    description: t("scriptioOpen.ambiguous"),
                    actions: (
                        <>
                            {plan.projectIds.map((id) => (
                                <button
                                    key={id}
                                    className={`${styles.btn} ${styles.primaryBtn}`}
                                    onClick={() => run(() => acceptScriptioMerge(id))}
                                    disabled={busy}
                                >
                                    <GitMerge size={16} />
                                    {t("scriptioOpen.updateNamed", { project: titleOf(id) })}
                                </button>
                            ))}
                            {newProjectButton(true)}
                            {cancelButton}
                        </>
                    ),
                };
            default:
                return { description: "", actions: cancelButton };
        }
    };

    const { description, note, actions } = body() as {
        description: string;
        note?: string;
        actions: React.ReactNode;
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <h2 className={styles.title}>{t("scriptioOpen.title", { file: pending.fileName })}</h2>
                <p className={styles.description}>{description}</p>
                {note && <p className={styles.versionDetails}>{note}</p>}
                {error && <p className={styles.versionDetails}>{error}</p>}
                <div className={styles.actions}>{actions}</div>
            </div>
        </div>
    );
};

export default ScriptioOpenDialog;
