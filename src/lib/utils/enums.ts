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
    Bold = 1,
    Italic = 2,
    Underline = 3,
}

export enum ScreenplayElement {
    Scene,
    Action,
    Character,
    Dialogue,
    Parenthetical,
    Transition,
    Section,
    Note,
    None,
}
