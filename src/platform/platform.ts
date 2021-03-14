export const CONSTRAINT_ERROR = `ConstraintError`;
export const QUOTA_EXCEEDED_ERROR = `QuotaExceededError`;
export const UNKNOWN_ERROR = `UnknownError`;
export const INVALID_ACCESS_ERROR = `InvalidAccessError`;
export const INVALID_STATE_ERROR = `InvalidStateError`;
export const NOT_FOUND_ERROR = `NotFoundError`;
export const VERSION_ERROR = `VersionError`;
export const DATABASE_CLOSED_ERROR = `DatabaseClosedError`;
export const PATH_EXISTS_ERROR = `PathExistsError`;
export const INVALID_MODIFICATION_ERROR = `InvalidModificationError`;

export function isOutOfMemoryError(e: Error) {
    return e.name === UNKNOWN_ERROR || e.name === QUOTA_EXCEEDED_ERROR;
}

export class DatabaseClosedError extends Error {
    constructor() {
        super(`Database has been closed`);
        this.name = DATABASE_CLOSED_ERROR;
    }
}
