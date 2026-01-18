export { SceneNode } from "./scene-node";
export { ActionNode } from "./action-node";
export { CharacterNode } from "./character-node";
export { DialogueNode } from "./dialogue-node";
export { ParentheticalNode } from "./parenthetical-node";
export { TransitionNode } from "./transition-node";
export { SectionNode } from "./section-node";
export { NoteNode } from "./note-node";

export { ScriptioBold, ScriptioItalic, ScriptioUnderline } from "./marks-node";

export type { SceneNodeOptions } from "./scene-node";
export type { ActionNodeOptions } from "./action-node";
export type { CharacterNodeOptions } from "./character-node";
export type { DialogueNodeOptions } from "./dialogue-node";
export type { ParentheticalNodeOptions } from "./parenthetical-node";
export type { TransitionNodeOptions } from "./transition-node";
export type { SectionNodeOptions } from "./section-node";
export type { NoteNodeOptions } from "./note-node";

import { SceneNode } from "./scene-node";
import { ActionNode } from "./action-node";
import { CharacterNode } from "./character-node";
import { DialogueNode } from "./dialogue-node";
import { ParentheticalNode } from "./parenthetical-node";
import { TransitionNode } from "./transition-node";
import { SectionNode } from "./section-node";
import { NoteNode } from "./note-node";

export const ScreenplayNodes = [
    ActionNode,
    SceneNode,
    CharacterNode,
    DialogueNode,
    ParentheticalNode,
    TransitionNode,
    SectionNode,
    NoteNode,
];

export const SCREENPLAY_NODE_NAMES = {
    scene: "scene",
    action: "action",
    character: "character",
    dialogue: "dialogue",
    parenthetical: "parenthetical",
    transition: "transition",
    section: "section",
    note: "note",
} as const;
