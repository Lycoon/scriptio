import { useEffect, useState } from "react";
import { useEditorState } from "../context/AppContext";
import { convertFountainToJSON } from "../src/converters/fountain_to_scriptio";
import EditorComponent from "./EditorComponent";
import EditorSidebar from "./EditorSidebar";

const demo = `A RIVER.

We're underwater, watching a fat catfish swim along.  

This is The Beast.

EDWARD (V.O.)
There are some fish that cannot be caught.  It's not that they're faster or stronger than other fish.  They're just touched by something extra.  Call it luck.  Call it grace.  One such fish was The Beast.  

The Beast's journey takes it past a dangling fish hook, baited with worms.  Past a tempting lure, sparkling in the sun.  Past a swiping bear claw.  The Beast isn't worried.

EDWARD (V.O.)(CONT'D)
By the time I was born, he was already a legend.  He'd taken more hundred-dollar lures than any fish in Alabama. Some said that fish was the ghost of Henry Walls, a thief who'd drowned in that river 60 years before.   Others claimed he was a lesser dinosaur, left over from the Cretaceous period.

INT.  WILL'S BEDROOM - NIGHT (1973)

WILL BLOOM, AGE 3, listens wide-eyed as his father EDWARD BLOOM, 40's and handsome, tells the story.  In every gesture, Edward is bigger than life, describing each detail with absolute conviction.

EDWARD
I didn't put any stock into such speculation or superstition.  All I knew was I'd been trying to catch that fish since I was a boy no bigger than you.  
(closer)
And on the day you were born, that was the day I finally caught him.

EXT.  CAMPFIRE - NIGHT (1977)

A few years later, and Will sits with the other INDIAN GUIDES as Edward continues telling the story to the tribe.  

EDWARD
Now, I'd tried everything on it:  worms, lures, peanut butter, peanut butter-and-cheese.  But on that day I had a revelation:  if that fish was the ghost of a thief, the usual bait wasn't going to work.  I would have to use something he truly desired. 

Edward points to his wedding band, glinting in the firelight.

LITTLE BRAVE
(confused)
Your finger?

Edward slips his ring off.

EDWARD
Gold.

While the other boys are rapt with attention, Will looks bored.  He's heard this story before.

EDWARD
I tied my ring to the strongest line they made -- strong enough to hold up a bridge, they said, if just for a few minutes -- and I cast upriver.

INT.  BLOOM FRONT HALL - NIGHT (1987)

Edward is chatting up Will's pretty DATE to the homecoming dance.  She is enjoying the story, but also the force of Edward's charisma.  He's hypnotizing.

EDWARD (CONT'D)
The Beast jumped up and grabbed it before the ring even hit the water.  And just as fast, he snapped clean through that line.

WILL, now 17 with braces, is fuming and ready to leave.  His mother SANDRA -- from whom he gets his good looks and practicality -- stands with him at the door.

EDWARD
You can see my predicament.  My wedding ring, the symbol of fidelity to my wife, soon to be the mother of my child, was now lost in the gut of an uncatchable fish.

ON WILL AND SANDRA

WILL
(low but insistent)
Make him stop.`;

const EditorAndSidebar = () => {
  const { editor, updateEditor } = useEditorState();
  const [selectedTab, updateSelectedTab] = useState<number>(0);
  const tabs = [
    "Scene",
    "Action",
    "Character",
    "Dialogue",
    "Parenthetical",
    "Transition",
  ];

  const setActiveTab = (node: string) => {
    updateSelectedTab(tabs.indexOf(node));
    editor?.chain().focus().toggleNode(node, node, {}).run();
  };

  const tabKeyPressed = (event: any) => {
    if (event.key === "Tab") {
      event.preventDefault();

      const idx = (selectedTab + 1) % 6;
      updateSelectedTab(idx);
      setActiveTab(tabs[idx]);
    } else if (event.key === "$") {
      console.log("editor: ", editor);
      convertFountainToJSON(demo, editor!);
    }
  };

  useEffect(() => {
    setActiveTab("Action");
  }, [editor]);

  useEffect(() => {
    document.addEventListener("keydown", tabKeyPressed, false);

    return () => {
      document.removeEventListener("keydown", tabKeyPressed, false);
    };
  }, [selectedTab]);

  return (
    <div id="editor-and-sidebar">
      <div id="editor-container">
        <EditorComponent setActiveTab={setActiveTab} />
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
