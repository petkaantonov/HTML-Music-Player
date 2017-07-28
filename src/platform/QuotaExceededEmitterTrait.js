export const QUOTA_EXCEEDED_EVENT = `quotaExceeded`;

export default {
    quotaExceeded() {
        this.emit(QUOTA_EXCEEDED_EVENT);
    }
};
