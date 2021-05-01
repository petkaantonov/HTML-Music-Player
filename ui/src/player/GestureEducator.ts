import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import { gestureEducationMessages, StoredGestureEducationMessages } from "shared/src/preferences";
import { SelectDeps } from "ui/Application";
import Page from "ui/platform/dom/Page";
import Snackbar, { ACTION_CLICKED, DISMISSED } from "ui/ui/Snackbar";

type Deps = SelectDeps<"page" | "snackbar" | "db" | "dbValues">;

export default class GestureEducator implements Deps {
    page: Page;
    snackbar: Snackbar;
    db: KeyValueDatabase;
    dbValues: Deps["dbValues"];
    store: StoredGestureEducationMessages;
    constructor(deps: Deps) {
        this.page = deps.page;
        this.snackbar = deps.snackbar;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.store = this.dbValues.gestureEducations ?? {};
    }

    async educate<T extends keyof StoredGestureEducationMessages>(gesture: T) {
        const msg = gestureEducationMessages[gesture];
        if (!msg) return;
        const tag = `${gesture}-gesture-education`;

        if (this.store[gesture]) return;

        const outcome = await this.snackbar.show(msg.value, {
            action: `got it`,
            visibilityTime: 6500,
            tag,
        });

        if (outcome === ACTION_CLICKED.value || outcome === DISMISSED.value) {
            this.store[gesture] = gestureEducationMessages[gesture].value as any;
            await this.db.set("gestureEducations", this.store);
        }
    }
}
