import { Editor } from "@tiptap/react";
import { SaveStatus } from "../utils/enums";
import { saveScreenplay } from "../utils/requests";
import { ProjectContextType } from "@src/context/ProjectContext";
import { useDebouncedCallback } from "use-debounce";
import { computeFullScenesData } from "./screenplay";
import { computeFullCharactersData } from "./characters";

export const focusOnPosition = (editorView: Editor, position: number) => {
    editorView.commands.focus(position);
};

export const selectTextInEditor = (editorView: Editor, start: number, end: number) => {
    editorView.chain().focus(start).setTextSelection({ from: start, to: end }).run();
};

export const cutTextSelection = (editorView: Editor, start: number, end: number) => {
    editorView.commands.deleteRange({ from: start, to: end - 1 });
};

export const copyTextSelection = (editorView: Editor, start: number, end: number) => {
    console.log("copy from " + start + " to " + end);
    //editorView?.state.doc.copy();
};

export const replaceRange = (editorView: Editor, start: number, end: number, text: string) => {
    editorView.chain().focus(start).setTextSelection({ from: start, to: end }).insertContent(text).run();
};

export const pasteText = (editorView: Editor, text: string) => {
    editorView.commands.insertContent(text);
};

export const pasteTextAt = (editorView: Editor, text: string, position: number) => {
    editorView.commands.insertContentAt(position, text);
};

export const save = async (ctx: ProjectContextType, projectId: string, screenplay: any) => {
    if (ctx.saveStatus !== SaveStatus.Saved) {
        ctx.updateSaveStatus(SaveStatus.Saving);
        const res = await saveScreenplay(projectId, screenplay, ctx.charactersData);

        if (!res.ok) {
            ctx.updateSaveStatus(SaveStatus.Error);
            return;
        }

        ctx.updateSaveStatus(SaveStatus.Saved);
    }
};

export const deferredScreenplaySave = useDebouncedCallback(
    (ctx: ProjectContextType, projectId: string, screenplay: any) => {
        save(ctx, projectId, screenplay);
    },
    2000
);

export const deferredSceneUpdate = useDebouncedCallback(async (ctx: ProjectContextType, screenplay: any) => {
    computeFullScenesData(screenplay, ctx);
}, 500);

export const deferredCharactersUpdate = useDebouncedCallback(async (ctx: ProjectContextType, screenplay: any) => {
    computeFullCharactersData(screenplay, project.characters, ctx);
}, 500);
