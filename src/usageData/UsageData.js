import {USAGE_DATA_READY_EVENT_NAME} from "usageData/UsageDataBackend";
import WorkerFrontend from "WorkerFrontend";

export default class UsageData extends WorkerFrontend {
    constructor(deps) {
        super(USAGE_DATA_READY_EVENT_NAME, deps.workerWrapper);

    }

    async setSkipCounter(track, counter) {
        if (!track.tagData) return;

        const uid = await track.uid();
        this.postMessage({
            action: `setSkipCounter`,
            args: {uid, counter}
        });
    }

    async setPlaythroughCounter(track, counter) {
        if (!track.tagData) return;

        const uid = await track.uid();
        this.postMessage({
            action: `setPlaythroughCounter`,
            args: {uid, counter}
        });
    }

    async rateTrack(track, rating) {
        if (!track.tagData) return;

        const uid = await track.uid();
        this.postMessage({
            action: `rateTrack`,
            args: {uid, rating}
        });
    }
}


