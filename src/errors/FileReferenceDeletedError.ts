export default class FileReferenceDeletedError extends Error {
    constructor() {
        super(`file reference has been deleted`);
    }
}
