import AbstractBackend from "AbstractBackend";

export const USAGE_DATA_READY_EVENT_NAME = `usageDataReady`;

export default class UsageDataBackend extends AbstractBackend {
    constructor(db) {
        super(USAGE_DATA_READY_EVENT_NAME);
        this.db = db;
        this.actions = {
            rateTrack({uid, rating}) {
                this.db.updateRating(uid, rating);
            },

            setSkipCounter({uid, counter}) {
                this.db.updateSkipCounter(uid, counter, new Date());
            },

            setPlaythroughCounter({uid, counter}) {
                this.db.updatePlaythroughCounter(uid, counter, new Date());
            }
        };
    }
}
