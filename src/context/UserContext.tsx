import { Editor, useEditor } from "@tiptap/react";
import { createContext, ReactNode, useState } from "react";
import { User } from "../../pages/api/users";

export type contextType = {
  user: User | null;
  updateUser: (user: User) => void;
  editor: Editor | null;
  updateEditor: (editor: Editor) => void;
};

const contextDefaults: contextType = {
  user: null,
  updateUser: () => {},
  editor: null,
  updateEditor: () => {},
};

type Props = {
  children: ReactNode;
};

export const UserContext = createContext<contextType>(contextDefaults);

export function ContextProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const updateUser = (user_: User) => {
    setUser(user_);
  };

  const updateEditor = (editor_: Editor) => {
    setEditor(editor_);
  };

  const value = {
    user,
    updateUser,
    editor,
    updateEditor,
  };

  return (
    <>
      <UserContext.Provider value={value}>{children}</UserContext.Provider>
    </>
  );
}
