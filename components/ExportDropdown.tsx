import DropdownItem from "./DropdownItem";

const ExportDropdown = (props: any) => {
  const exportPDF = () => {
    console.log("export pdf screenplay");
  };

  const exportFountain = () => {
    console.log("export fountain screenplay");
  };

  return (
    <div className="dropdown-items export-dropdown">
      <DropdownItem action={exportPDF} content="to PDF"></DropdownItem>
      <DropdownItem action={exportFountain} content="to Fountain"></DropdownItem>
    </div>
  );
};

export default ExportDropdown;
