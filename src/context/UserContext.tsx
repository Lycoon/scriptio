import { Editor, useEditor } from "@tiptap/react";
import { createContext, ReactNode, useState } from "react";
import { User } from "../../pages/api/users";
import useUser from "../lib/useUser";

export type contextType = {
  user: User | undefined;
  updateUser: (user: User | undefined) => void;
  editor: Editor | undefined;
  updateEditor: (editor: Editor) => void;
};

const contextDefaults: contextType = {
  user: undefined,
  updateUser: () => {},
  editor: undefined,
  updateEditor: () => {},
};

type Props = {
  children: ReactNode;
};

export const UserContext = createContext<contextType>(contextDefaults);

export function ContextProvider({ children }: Props) {
  const { user, setUser } = useUser();
  const [editor, setEditor] = useState<Editor | undefined>(undefined);

  const updateUser = (user_: User | undefined) => {
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
