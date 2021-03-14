export interface DatabaseEventsMap {
    databaseClosed: () => void;
}

export interface DatabaseClosedEmitterTrait {
    databaseClosed: (this: any) => void;
}

export const DatabaseClosedEmitterTrait = {
    databaseClosed(this: any) {
        this.emit("databaseClosed");
    },
};

export interface DatabaseClosedResult {
    type: "databaseClosed";
}
