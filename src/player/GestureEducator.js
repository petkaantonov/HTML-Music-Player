import {DISMISSED, ACTION_CLICKED} from "ui/Snackbar";

const GESTURE_EDUCATION_KEY = `gesture-education`;

const gestureEducationMessages = {
    "playpause": `Tap the screen with two fingers to toggle play/pause`,
    "next": `Swipe right with two fingers to play the next track`,
    "previous": `Swip left with two fingers to play the previous track`
};

export default function GestureEducator(deps) {
    this.page = deps.page;
    this.snackbar = deps.snackbar;
    this.db = deps.db;
    this.dbValues = deps.dbValues;
    this.store = Object(this.dbValues[GESTURE_EDUCATION_KEY]);
}

GestureEducator.prototype.educate = async function(gesture) {
    const msg = gestureEducationMessages[gesture];
    if (!msg) return;
    const tag = `${gesture}-gesture-education`;

    if (this.store[gesture] === true) return;

    const outcome = await this.snackbar.show(msg, {
        action: `got it`,
        visibilityTime: 6500,
        tag
    });

    if (outcome === ACTION_CLICKED || outcome === DISMISSED) {
        this.store[gesture] = true;
        await this.db.set(GESTURE_EDUCATION_KEY, this.store);
    }
};
