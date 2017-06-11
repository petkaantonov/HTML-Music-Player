import AbstractBackend from "AbstractBackend";
import TagDatabase from "tracks/TagDatabase";

export const USAGE_DATA_READY_EVENT_NAME = `usageDataReady`;

export default class UsageDataBackend extends AbstractBackend {
    constructor() {
        super(USAGE_DATA_READY_EVENT_NAME);
        this.db = new TagDatabase();
        this.actions = {
            rateTrack({uid, rating}) {
                this.db.updateRating(uid, rating);
            },

            setSkipCounter({uid, counter}) {
                this.db.updateSkipCounter(uid, counter, Date.now());
            },

            setPlaythroughCounter({uid, counter}) {
                this.db.updatePlaythroughCounter(uid, counter, Date.now());
            }
        };
    }
}
