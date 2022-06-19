import FileSaver from "file-saver";
import { useContext } from "react";
import { Project } from "../../../pages/api/users";
import { UserContext } from "../../../src/context/UserContext";
import { convertJSONtoFountain } from "../../../src/converters/scriptio_to_fountain";
import { exportToPDF } from "../../../src/converters/scriptio_to_pdf";
import DropdownItem from "./DropdownItem";

type Props = {
    project: Project;
};

const ExportDropdown = ({ project }: Props) => {
    const { editor } = useContext(UserContext);

    const exportPDF = () => {
        exportToPDF(project.title, "author", editor?.getJSON()!);
    };

    const exportFountain = () => {
        const fountain = convertJSONtoFountain(editor?.getJSON());
        const file = new File([fountain], project.title + ".fountain", {
            type: "text/plain;charset=utf-8",
        });
        FileSaver.saveAs(file);
    };

    return (
        <div className="dropdown-items export-dropdown">
            <DropdownItem action={exportPDF} content="to PDF"></DropdownItem>
            <DropdownItem
                action={exportFountain}
                content="to Fountain"
            ></DropdownItem>
        </div>
    );
};

export default ExportDropdown;
