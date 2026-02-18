"use client";

import { useContext, useMemo, useState } from "react";
import { useCookieUser, useProjectCollaborators, useProjectInvites, useProjectMembership } from "@src/lib/utils/hooks";
import { CookieUser } from "@src/lib/utils/types";
import { ProjectRole } from "@prisma/client";
import { Collaborator, ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Info } from "lucide-react";

import form from "./../../utils/Form.module.css";
import shared from "./ProjectSettings.module.css";
import styles from "./CollaboratorsSettings.module.css";
import { deleteInvite, inviteCollaborator, kickCollaborator, updateMemberRole } from "@src/lib/utils/requests";

import * as Roles from "@src/lib/utils/roles";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { DashboardContext } from "@src/context/DashboardContext";
import { redirect } from "next/navigation";

const MAX_COLLABORATORS = 5;

const CollaboratorsSettings = () => {
    const { membership } = useProjectMembership();
    const { invites, mutate: mutateInvites } = useProjectInvites(membership?.project.id);
    const { collaborators, mutate: mutateCollaborators } = useProjectCollaborators(membership?.project.id);
    const { user } = useCookieUser();

    const slots = useMemo(() => {
        if (!membership) return [];

        const owner = collaborators.find((c) => c.role === ProjectRole.OWNER);
        const otherMembers = collaborators.filter((c) => c.role !== ProjectRole.OWNER);

        const result: { type: "MEMBER" | "INVITE" | "EMPTY"; data: any; key: string }[] = [];

        if (owner) result.push({ type: "MEMBER", data: owner, key: `member-${owner.user.id}` });
        otherMembers.forEach((m) => result.push({ type: "MEMBER", data: m, key: `member-${m.user.id}` }));
        invites.forEach((i) => result.push({ type: "INVITE", data: i, key: `invite-${i.email}` }));

        const remaining = MAX_COLLABORATORS - result.length;
        for (let i = 0; i < remaining; i++) {
            result.push({ type: "EMPTY", data: null, key: `empty-${i}` });
        }

        return result;
    }, [membership, collaborators, invites]);

    if (!membership || !user) return null;

    return (
        <div className={styles.container}>
            <section className={styles.section}>
                <div className={styles.labelRow}>
                    <label className={form.label}>
                        Project Team ({collaborators.length + invites.length}/{MAX_COLLABORATORS})
                    </label>
                    <div className={styles.infoIconWrapper}>
                        <Info size={16} className={styles.infoIcon} />
                        <div className={styles.permissionsHint}>
                            <div className={styles.hintItem}>
                                <span className={styles.hintRole}>Owner</span>
                                Can delete the project and transfer ownership
                            </div>
                            <div className={styles.hintItem}>
                                <span className={styles.hintRole}>Admin</span>
                                Can invite, promote, demote, and kick collaborators
                            </div>
                            <div className={styles.hintItem}>
                                <span className={styles.hintRole}>Editor</span>
                                Can modify screenplay and other project content
                            </div>
                            <div className={styles.hintItem}>
                                <span className={styles.hintRole}>Viewer</span>
                                Read-only access. Cannot make any changes
                            </div>
                        </div>
                    </div>
                </div>
                <p className={shared.helpText}>
                    Manage your team members and pending invitations. You can invite any non-Pro user to be part of your
                    project. The project remains collaborative until owner has Pro plan.
                </p>

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
    const { closeDashboard } = useContext(DashboardContext);

    const isOwner = data.role === ProjectRole.OWNER;
    const isAdmin = Roles.hasRoleOrGreater(membership.role, ProjectRole.ADMIN);
    const isSelf = data.user.email === user.email;
    const canKick = (isSelf && !isOwner) || isAdmin;

    const handleKick = async () => {
        const res = await kickCollaborator(membership.project.id, data.user.id);

        if (res.ok) {
            if (res.status !== 204) {
                // If user left the project by himself, redirect him to home
                const json = (await res.json()) as ApiResponse;
                if (json.data && json.data.redirectUrl) {
                    closeDashboard();
                    redirect(json.data.redirectUrl);
                }
            } else {
                mutateCollaborators();
            }
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
                        {data.user.email} {isSelf && "(you)"}
                    </span>
                </div>

                <div className={styles.memberActions}>
                    <select
                        className={styles.roleSelect}
                        defaultValue={data.role}
                        onChange={(e) => updateRole(e.target.value as ProjectRole)}
                        disabled={!isAdmin || isSelf}
                    >
                        <option value="OWNER">Owner</option>
                        <option value="ADMIN">Admin</option>
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                    </select>
                    {
                        <button onClick={handleKick} className={styles.kickBtn} disabled={!canKick}>
                            {isSelf ? "Leave" : "Kick"}
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
                    <span className={styles.pendingBadge}>Pending</span>
                </div>

                <div className={styles.memberActions}>
                    <button onClick={handleCancelInvite} className={styles.cancelBtn} disabled={!canInvite}>
                        Cancel
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
                    placeholder="Enter email..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.miniInput}
                />
                <div className={styles.memberActions}>
                    <button onClick={handleInvite} disabled={!email || !canInvite} className={styles.addBtn}>
                        Invite
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollaboratorsSettings;
