// ------------------------------ //
//             WEBSITE            //
// ------------------------------ //

export enum VerificationStatus {
    Success,
    Failed,
    Used,
}

export enum PasswordRecoverStatus {
    Success,
    Failed,
    Expired,
}

export enum Page {
    Export,
    Screenplay,
    Statistics,
    Edit,
}

// ------------------------------ //
//            PROJECT             //
// ------------------------------ //

export enum SaveStatus {
    Saving,
    Saved,
    NotSaved,
    Error,
}

export enum SaveMode {
    Local = 1,
    Cloud = 2,
    Both = Local | Cloud,
}

// ------------------------------ //
//            EDITOR              //
// ------------------------------ //

export enum Style {
    None = 0,
    Bold = 1,
    Italic = 2,
    Underline = 4,
}

// String values must match the class names in the /public/scriptio.css file
export enum ScreenplayElement {
    Scene = "scene",
    Action = "action",
    Character = "character",
    Dialogue = "dialogue",
    Parenthetical = "parenthetical",
    Transition = "transition",
    Section = "section",
    Note = "note",
    None = "none",
}
