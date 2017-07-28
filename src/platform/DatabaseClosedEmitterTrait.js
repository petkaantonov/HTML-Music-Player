export const DATABASE_CLOSED_EVENT = `databaseClosed`;

export default {
    databaseClosed() {
        this.emit(DATABASE_CLOSED_EVENT);
    }
};
