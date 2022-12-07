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
                <div className="form-info-error popup-info">
                    <p>
                        Are you sure you want to import a screenplay? This will <b>overwrite</b>{" "}
                        your current screenplay. You can export your screenplay before importing a
                        new one.
                    </p>
                </div>
                <button
                    className="form-btn popup-confirm popup-import-confirm"
                    onClick={onConfirmImport}
                >
                    Yes, import
                </button>
                <button className="form-btn popup-cancel" onClick={closePopup}>
                    No
                </button>
            </div>
        </div>
    );
};

export default PopupImportFile;
