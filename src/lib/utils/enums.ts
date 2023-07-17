export enum VerificationStatus {
    SUCCESS,
    FAILED,
    USED,
}

export enum PasswordRecoverStatus {
    SUCCESS,
    FAILED,
    EXPIRED,
}

export enum SaveStatus {
    SAVING,
    SAVED,
    NOT_SAVED,
    ERROR,
}

export enum SaveMode {
    LOCAL = 1,
    CLOUD = 2,
    BOTH = LOCAL | CLOUD,
}

export enum Page {
    EXPORT,
    SCREENPLAY,
    STATISTICS,
    EDIT,
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
