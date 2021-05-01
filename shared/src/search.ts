import { DatabaseClosedResult } from "./platform/DatabaseClosedEmitterTrait";

export interface SearchOpts {
    sessionId: number;
    normalizedQuery: string;
}

export interface SearchBackendActions<T> {
    search: (this: T, o: SearchOpts) => void;
}

export interface SearchResult {
    trackUid: ArrayBuffer;
    distance: number;
}

export interface SearchResults {
    type: "searchResults";
    searchSessionId: number;
    results: SearchResult[];
}

export type SearchWorkerResult = SearchResults | DatabaseClosedResult;
