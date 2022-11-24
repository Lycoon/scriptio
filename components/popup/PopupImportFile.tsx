type Props = {
    confirmImport: () => void;
    closePopup: () => void;
};

const PopupImportFile = ({ confirmImport, closePopup }: Props) => {
    const onConfirmImport = () => {
        confirmImport();
        closePopup();
    };

    return (
        <div className="popup-container">
            <div className="popup">
                <div className="popup-header">
                    <h2 className="popup-title">Import screenplay</h2>
                    <div className="settings-btn" onClick={closePopup}>
                        <img className="settings-icon" src="/images/close.png" />
                    </div>
                </div>
                <button className="form-btn popup-confirm" onClick={onConfirmImport}>
                    Yes, import
                </button>
                <button className="form-btn popup-confirm" onClick={closePopup}>
                    No
                </button>
            </div>
        </div>
    );
};

export default PopupImportFile;
