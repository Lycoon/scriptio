"use client";

import { useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useCookieUser, useProjectCollaborators, useProjectInvites, useProjectMembership } from "@src/lib/utils/hooks";
import { CookieUser } from "@src/lib/utils/types";
import { ProjectRole } from "../../../src/generated/client/browser";
import { Collaborator, ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Info } from "lucide-react";

import form from "./../../utils/Form.module.css";
import shared from "./ProjectSettings.module.css";
import styles from "./CollaboratorsSettings.module.css";
import { deleteInvite, inviteCollaborator, kickCollaborator, updateMemberRole } from "@src/lib/utils/requests";

import * as Roles from "@src/lib/utils/roles";
import { DashboardContext } from "@src/context/DashboardContext";

const MAX_COLLABORATORS = 5;

const CollaboratorsSettings = () => {
    const t = useTranslations("collaborators");
    const { membership, isLocalOnly } = useProjectMembership();
    const { invites, mutate: mutateInvites } = useProjectInvites(membership?.project.id);
    const { collaborators, mutate: mutateCollaborators } = useProjectCollaborators(membership?.project.id);
    const { user } = useCookieUser();

    const slots = useMemo(() => {
        if (!membership) return [];

        const owner = collaborators.find((c) => c.role === ProjectRole.OWNER);
        const otherMembers = collaborators.filter((c) => c.role !== ProjectRole.OWNER);

        type Slot =
            | { type: "MEMBER"; data: Collaborator; key: string }
            | { type: "INVITE"; data: ProjectInvite; key: string }
            | { type: "EMPTY"; data: null; key: string };
        const result: Slot[] = [];

        if (owner) result.push({ type: "MEMBER", data: owner, key: `member-${owner.user.id}` });
        otherMembers.forEach((m) => result.push({ type: "MEMBER", data: m, key: `member-${m.user.id}` }));
        invites.forEach((i) => result.push({ type: "INVITE", data: i, key: `invite-${i.email}` }));

        const remaining = MAX_COLLABORATORS - result.length;
        for (let i = 0; i < remaining; i++) {
            result.push({ type: "EMPTY", data: null, key: `empty-${i}` });
        }

        return result;
    }, [membership, collaborators, invites]);

    const iconRef = useRef<HTMLDivElement>(null);
    const [hintPos, setHintPos] = useState<{ top: number; left: number } | null>(null);

    if (isLocalOnly) return <p style={{ color: "var(--secondary-text)", fontSize: "0.85rem" }}>{t("localProjectOnly")}</p>;
    if (!membership || !user) return null;

    const hint = hintPos && createPortal(
        <div className={styles.permissionsHint} style={{ top: hintPos.top, left: hintPos.left }}>
            <div className={styles.hintItem}>
                <span className={styles.hintRole}>{t("roles.owner")}</span>
                {t("roleDesc.owner")}
            </div>
            <div className={styles.hintItem}>
                <span className={styles.hintRole}>{t("roles.admin")}</span>
                {t("roleDesc.admin")}
            </div>
            <div className={styles.hintItem}>
                <span className={styles.hintRole}>{t("roles.editor")}</span>
                {t("roleDesc.editor")}
            </div>
            <div className={styles.hintItem}>
                <span className={styles.hintRole}>{t("roles.viewer")}</span>
                {t("roleDesc.viewer")}
            </div>
        </div>,
        document.body,
    );

    return (
        <div className={styles.container}>
            {hint}
            <section className={styles.section}>
                <div className={styles.labelRow}>
                    <label className={form.label}>
                        {t("projectTeam", { count: collaborators.length + invites.length, max: MAX_COLLABORATORS })}
                    </label>
                    <div
                        className={styles.infoIconWrapper}
                        ref={iconRef}
                        onMouseEnter={() => {
                            if (!iconRef.current) return;
                            const rect = iconRef.current.getBoundingClientRect();
                            setHintPos({ top: rect.bottom + 8, left: rect.left });
                        }}
                        onMouseLeave={() => setHintPos(null)}
                    >
                        <Info size={16} className={styles.infoIcon} />
                    </div>
                </div>
                <p className={shared.helpText}>{t("teamHelp")}</p>

                {/* Project Collaborators */}
                <div className={styles.slotGrid}>
                    {slots.map((slot) => {
                        switch (slot.type) {
                            case "MEMBER":
                                return (
                                    <MemberSlot
                                        key={slot.key}
                                        data={slot.data}
                                        membership={membership}
                                        mutateCollaborators={mutateCollaborators}
                                        user={user}
                                    />
                                );
                            case "INVITE":
                                return (
                                    <InviteSlot
                                        key={slot.key}
                                        data={slot.data}
                                        membership={membership}
                                        mutateInvites={mutateInvites}
                                    />
                                );
                            case "EMPTY":
                                return (
                                    <EmptySlot key={slot.key} membership={membership} mutateInvites={mutateInvites} />
                                );
                            default:
                                return null;
                        }
                    })}
                </div>
            </section>
        </div>
    );
};

interface MemberSlotProps {
    data: Collaborator;
    membership: ProjectMembershipPayload;
    mutateCollaborators: () => void;
    user: CookieUser;
}

const MemberSlot = ({ data, membership, mutateCollaborators, user }: MemberSlotProps) => {
    const t = useTranslations("collaborators");
    const { closeDashboard } = useContext(DashboardContext);

    const isOwner = data.role === ProjectRole.OWNER;
    const isAdmin = Roles.hasRoleOrGreater(membership.role, ProjectRole.ADMIN);
    const isSelf = data.user.email === user.email;
    const canKick = (isSelf && !isOwner) || (!isSelf && isAdmin);

    const handleKick = async () => {
        const res = await kickCollaborator(membership.project.id, data.user.id);
        if (!res.ok) return;

        if (isSelf) {
            // Self-leave: the server has already deleted the membership and
            // blacklisted the user on the WS, so a 4003 close is on its way.
            // The cloud-sync hook surfaces ProjectUnavailableDialog from there,
            // letting the leaver decide whether to keep a local copy or discard.
            // We just close the dashboard so the dialog isn't covered.
            closeDashboard();
        } else {
            mutateCollaborators();
        }
    };

    const updateRole = async (newRole: ProjectRole) => {
        const res = await updateMemberRole(membership.project.id, data.user.id, { role: newRole });
        if (res.ok) {
            mutateCollaborators();
        }
    };

    return (
        <div className={styles.slot}>
            <div className={styles.memberItem}>
                <div className={styles.memberInfo}>
                    <span className={styles.memberEmail}>
                        {data.user.email} {isSelf && t("you")}
                    </span>
                </div>

                <div className={styles.memberActions}>
                    <select
                        className={styles.roleSelect}
                        defaultValue={data.role}
                        onChange={(e) => updateRole(e.target.value as ProjectRole)}
                        disabled={!isAdmin || isSelf}
                    >
                        <option value="OWNER">{t("roles.owner")}</option>
                        <option value="ADMIN">{t("roles.admin")}</option>
                        <option value="EDITOR">{t("roles.editor")}</option>
                        <option value="VIEWER">{t("roles.viewer")}</option>
                    </select>
                    {
                        <button onClick={handleKick} className={styles.kickBtn} disabled={!canKick}>
                            {isSelf ? t("leave") : t("kick")}
                        </button>
                    }
                </div>
            </div>
        </div>
    );
};

interface InviteSlotProps {
    data: ProjectInvite;
    membership: ProjectMembershipPayload;
    mutateInvites: () => void;
}

const InviteSlot = ({ data, membership, mutateInvites }: InviteSlotProps) => {
    const t = useTranslations("collaborators");
    const canInvite = Roles.hasRoleOrGreater(membership.role, ProjectRole.ADMIN);
    const handleCancelInvite = async () => {
        const res = await deleteInvite(membership.project.id, data.email);
        if (res.ok) {
            mutateInvites();
        }
    };

    return (
        <div className={`${styles.slot} ${styles.pendingSlot}`}>
            <div className={styles.memberItem}>
                <div className={styles.memberInfo}>
                    <span className={styles.memberEmail}>{data.email}</span>
                    <span className={styles.pendingBadge}>{t("pending")}</span>
                </div>

                <div className={styles.memberActions}>
                    <button onClick={handleCancelInvite} className={styles.cancelBtn} disabled={!canInvite}>
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface EmptySlotProps {
    membership: ProjectMembershipPayload;
    mutateInvites: () => void;
}

const EmptySlot = ({ membership, mutateInvites }: EmptySlotProps) => {
    const t = useTranslations("collaborators");
    const [email, setEmail] = useState("");

    const canInvite = Roles.hasRoleOrGreater(membership.role, ProjectRole.ADMIN);
    const handleInvite = async () => {
        const res = await inviteCollaborator(membership.project.id, email);
        if (res.ok) {
            mutateInvites();
            setEmail("");
        }
    };

    return (
        <div className={`${styles.slot} ${styles.empty}`}>
            <div className={styles.inviteAction}>
                <input
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.miniInput}
                />
                <div className={styles.memberActions}>
                    <button onClick={handleInvite} disabled={!email || !canInvite} className={styles.addBtn}>
                        {t("invite")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollaboratorsSettings;
