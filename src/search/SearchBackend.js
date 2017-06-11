import AbstractBackend from "AbstractBackend";
import TrackSearchIndex from "search/TrackSearchIndex";

export const SEARCH_READY_EVENT_NAME = `searchReady`;

export default class SearchBackend extends AbstractBackend {
    constructor(trackAnalyzerBackend) {
        super(SEARCH_READY_EVENT_NAME);
        this.searchIndex = new TrackSearchIndex();
        this.actions = {
            search({sessionId, normalizedQuery}) {
                const results = this.searchIndex.search(normalizedQuery);
                this.postMessage({
                    searchSessionId: sessionId,
                    type: `searchResults`,
                    results
                });
            },

            updateSearchIndex({transientId, metadata}) {
                this.searchIndex.update(transientId, metadata);
            },

            removeFromSearchIndex({transientId}) {
                this.searchIndex.remove(transientId);
            }
        };

        trackAnalyzerBackend.on(`metadataParsed`, ({file, metadata, transientId}) => {
            this.searchIndex.add(file, metadata, transientId);
        });
    }
}
