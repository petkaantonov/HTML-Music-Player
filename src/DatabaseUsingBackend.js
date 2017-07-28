import AbstractBackend from "AbstractBackend";

export const DATABASE_HAS_BEEN_CLOSED_MESSAGE = `databaseHasBeenClosed`;

export default class DatabaseUsingBackend extends AbstractBackend {
    constructor(frontendName, database) {
        super(frontendName);
        this._database = database;
    }

    get database() {
        if (!this._database) {
            throw new Error(`database has not been set`);
        }
        return this._database;
    }

    set database(value) {
        if (this._database) {
            throw new Error(`database has been set already`);
        }
        this._database = value;
    }

    canUseDatabase() {
        if (this.database.isClosed()) {
            this.postMessage({type: DATABASE_HAS_BEEN_CLOSED_MESSAGE});
            return false;
        }
        return true;
    }
}
