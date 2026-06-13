import type { Editor } from '@tiptap/core'
import { Extension, isNodeEmpty } from '@tiptap/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { timeApply } from './apply-timing'

export interface PlaceholderOptions {
  /**
   * **The class name for the empty editor**
   * @default 'is-editor-empty'
   */
  emptyEditorClass: string

  /**
   * **The class name for empty nodes**
   * @default 'is-empty'
   */
  emptyNodeClass: string

  /**
   * **The placeholder content**
   *
   * You can use a function to return a dynamic placeholder or a string.
   * @default 'Write something …'
   */
  placeholder:
    | ((PlaceholderProps: { editor: Editor; node: ProsemirrorNode; pos: number; hasAnchor: boolean }) => string)
    | string

  /**
   * **Checks if the placeholder should be only shown when the editor is editable.**
   *
   * If true, the placeholder will only be shown when the editor is editable.
   * If false, the placeholder will always be shown.
   * @default true
   */
  showOnlyWhenEditable: boolean

  /**
   * **Checks if the placeholder should be only shown when the current node is empty.**
   *
   * If true, the placeholder will only be shown when the current node is empty.
   * If false, the placeholder will be shown when any node is empty.
   * @default true
   */
  showOnlyCurrent: boolean

  /**
   * **Controls if the placeholder should be shown for all descendents.**
   *
   * If true, the placeholder will be shown for all descendents.
   * If false, the placeholder will only be shown for the current node.
   * @default false
   */
  includeChildren: boolean
}

const placeholderPluginKey = new PluginKey('placeholder')

/**
 * This extension allows you to add a placeholder to your editor.
 * A placeholder is a text that appears when the editor or a node is empty.
 * @see https://www.tiptap.dev/api/extensions/placeholder
 */
export const Placeholder = Extension.create<PlaceholderOptions>({
  name: 'placeholder',

  addOptions() {
    return {
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      placeholder: 'Write something …',
      showOnlyWhenEditable: false,
      showOnlyCurrent: false,
      includeChildren: true,
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const options = this.options

    /**
     * Computes placeholder decorations for the entire document.
     * Only called when the set of empty nodes changes or the anchor moves.
     */
    function computePlaceholderDecorations(doc: ProsemirrorNode, anchor: number): DecorationSet {
      const active = editor.isEditable || !options.showOnlyWhenEditable
      if (!active) return DecorationSet.empty

      const decorations: Decoration[] = []
      const isEmptyDoc = editor.isEmpty

      doc.descendants((node, pos) => {
        const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize
        const isEmpty = !node.isLeaf && isNodeEmpty(node)

        if ((hasAnchor || !options.showOnlyCurrent) && isEmpty) {
          const classes = [options.emptyNodeClass]

          if (isEmptyDoc) {
            classes.push(options.emptyEditorClass)
          }

          const decoration = Decoration.node(pos, pos + node.nodeSize, {
            class: classes.join(' '),
            'data-placeholder':
              typeof options.placeholder === 'function'
                ? options.placeholder({
                    editor,
                    node,
                    pos,
                    hasAnchor,
                  })
                : options.placeholder,
          })

          decorations.push(decoration)
        }

        return options.includeChildren
      })

      return DecorationSet.create(doc, decorations)
    }

    return [
      new Plugin({
        key: placeholderPluginKey,
        state: {
          init(_, state) {
            return computePlaceholderDecorations(state.doc, state.selection.anchor)
          },
          apply: timeApply("placeholder", (tr, oldDecorations, oldState, newState) => {
            const oldAnchor = oldState.selection.anchor
            const newAnchor = newState.selection.anchor

            if (tr.docChanged) {
              return computePlaceholderDecorations(newState.doc, newAnchor)
            }

            // Selection-only change: recompute if anchor moved to different node
            // (showOnlyCurrent mode needs this, but also hasAnchor attribute changes)
            const anchorNodeChanged = oldState.doc.resolve(oldAnchor).parent !== newState.doc.resolve(newAnchor).parent
            if (anchorNodeChanged) {
              return computePlaceholderDecorations(newState.doc, newAnchor)
            }

            return oldDecorations
          }),
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
