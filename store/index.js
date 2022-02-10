import { Editor } from "@tiptap/vue-3";

export const state = () => ({
    editor: Editor
})

export const getters = {

}

export const actions = {

}

export const mutations = {
    setEditor(state, editor) {
        state.editor = editor;
    }
}
