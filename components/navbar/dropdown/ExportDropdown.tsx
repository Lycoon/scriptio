import FileSaver from "file-saver";
import { useEditorState } from "../../../context/AppContext";
import { convertJSONtoFountain } from "../../../src/converters/scriptio_to_fountain";
import { exportToPDF } from "../../../src/converters/scriptio_to_pdf";
import DropdownItem from "./DropdownItem";

const ExportDropdown = (props: any) => {
  const { editor, updateEditor } = useEditorState();
  const title = "title";
  const author = "author";

  const exportPDF = () => {
    exportToPDF(title, author, editor?.getJSON()!);
  };

  const exportFountain = () => {
    const fountain = convertJSONtoFountain(editor?.getJSON());
    const file = new File([fountain], title + ".fountain", {type: "text/plain;charset=utf-8"});
    FileSaver.saveAs(file);
  };

  return (
    <div className="dropdown-items export-dropdown">
      <DropdownItem action={exportPDF} content="to PDF"></DropdownItem>
      <DropdownItem action={exportFountain} content="to Fountain"></DropdownItem>
    </div>
  );
};

export default ExportDropdown;
