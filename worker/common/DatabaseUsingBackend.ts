import AbstractBackend from "common/AbstractBackend";
import TagDatabase from "metadata/TagDatabase";
import { DATABASE_HAS_BEEN_CLOSED_MESSAGE } from "src/types/worker";

import { DatabaseClosedResult } from "../../src/platform/DatabaseClosedEmitterTrait";
import KeyValueDatabase from "../../src/platform/KeyValueDatabase";
import { FrontendName } from "../../src/WorkerFrontend";

type DatabaseType = TagDatabase | KeyValueDatabase;

export default class DatabaseUsingBackend<
    T,
    K extends FrontendName,
    D extends DatabaseType = TagDatabase
> extends AbstractBackend<T, K> {
    protected _database: D | null;
    constructor(frontendName: K, database: D | null, actions: T) {
        super(frontendName, actions);
        this._database = database;
    }

    get database() {
        if (!this._database) {
            throw new Error(`database has not been set`);
        }
        return this._database;
    }

    set database(value: D) {
        if (this._database) {
            throw new Error(`database has been set already`);
        }
        this._database = value;
    }

    canUseDatabase() {
        if (this.database.isClosed()) {
            const msg: DatabaseClosedResult = { type: "databaseClosed" };
            this.postMessageToFrontend([msg]);
            return false;
        }
        return true;
    }
}
