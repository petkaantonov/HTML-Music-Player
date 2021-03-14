export interface QuotaExceededEventsMap {
    quotaExceeded: () => void;
}

export interface QuotaExceededEmitterTrait {
    quotaExceeded: (this: any) => void;
}

export const QuotaExceededEmitterTrait = {
    quotaExceeded(this: any) {
        this.emit("quotaExceeded");
    },
};

export interface QuotaExceededResult {
    type: "quotaExceeded";
}
