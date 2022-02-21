import { Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cp } from "fs/promises";
import { createContext, ReactNode, useContext, useState } from "react";

export type editorContextType = {
  editor: Editor | null;
  updateEditor: (editor: Editor) => void;
};

const editorContextDefaults: editorContextType = {
  editor: null,
  updateEditor: () => {},
};

const EditorContext = createContext<editorContextType>(editorContextDefaults);

export function useEditorState() {
  return useContext(EditorContext);
}

type Props = {
  children: ReactNode;
};

export function EditorProvider({ children }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);

  const updateEditor = (editor_: Editor) => {
    setEditor(editor_);
  };

  const value = {
    editor,
    updateEditor,
  };

  return (
    <>
      <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
    </>
  );
}
