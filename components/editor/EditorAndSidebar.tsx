import { useEditor } from "@tiptap/react";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import { Screenplay } from "../../src/Screenplay";
import EditorComponent from "./EditorComponent";
import EditorSidebar from "./EditorSidebar";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { Project } from "../../pages/api/users";
import { updateProject } from "../../src/server/service/project-service";

type Props = {
  project: Project;
};

const EditorAndSidebar = ({ project }: Props) => {
  const { editor, updateEditor } = useContext(UserContext);
  const [selectedTab, updateSelectedTab] = useState<number>(0);
  const tabs = [
    "scene",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "transition",
  ];

  const editorView = useEditor({
    extensions: [
      // default
      Document,
      Text,
      History,

      // scriptio
      Screenplay,
    ],

    // update active on caret update
    onSelectionUpdate({ transaction }) {
      const currNode = transaction.curSelection.$anchor.path[3].attrs.class;
      setActiveTab(currNode);
    },

    content: project.screenplay?.toString(),
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view: any, event: any) {
        const node = view.state.selection.$anchor.parent;
        const currNode = node.attrs.class;
        if (event.key === "Enter") {
          setTimeout(() => setActiveTab("action"), 20);
          if (currNode === "character" || currNode === "parenthetical") {
            clearTimeout();
            setTimeout(() => setActiveTab("dialogue"), 20);
          }
        }

        return false;
      },
    },
  });

  useEffect(() => {
    updateEditor(editorView!);
  }, []);

  const setActiveTab = (node: string) => {
    updateSelectedTab(tabs.indexOf(node));

    if (editorView)
      editorView.chain().focus().setNode("Screenplay", { class: node }).run();
  };

  const tabKeyPressed = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();

      const idx = (selectedTab + 1) % 6;
      updateSelectedTab(idx);
      setActiveTab(tabs[idx]);
    }
  };

  const saveKeyPressed = async (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      await updateProject({
        projectId: project.id,
        screenplay: editorView?.getJSON(),
      });
    }
  };

  useEffect(() => {
    addEventListener("keydown", tabKeyPressed, false);
    addEventListener("keydown", saveKeyPressed, false);
    return () => {
      removeEventListener("keydown", tabKeyPressed, false);
      removeEventListener("keydown", saveKeyPressed, false);
    };
  });

  return (
    <div id="editor-and-sidebar">
      <div id="editor-container">
        <EditorComponent editor={editorView} />
      </div>
      <EditorSidebar
        tabs={tabs}
        selectedTab={selectedTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
};

export default EditorAndSidebar;
