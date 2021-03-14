import { SelectDeps } from "Application";
import { DomWrapper } from "platform/dom/Page";
import GestureRecognizerContext, {
    PassiveTouchEventType,
    TAP_TIME,
    TouchEventType,
} from "ui/gestures/GestureRecognizerContext";

type Deps = SelectDeps<`recognizerContext`>;

export type TouchEventListener = (e: TouchEvent) => void;

export default class AbstractGestureRecognizer {
    recognizerContext: GestureRecognizerContext;
    protected _eventType: TouchEventType[];
    protected _recognizerHandler: TouchEventListener;

    protected constructor(recognizerContext: Deps[`recognizerContext`]) {
        this.recognizerContext = recognizerContext;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this._recognizerHandler = () => {};
        this._eventType = [];
    }

    page() {
        return this.recognizerContext.page;
    }

    fireLongPressStart(t: Touch) {
        this.recognizerContext.globalEvents._fireLongPressStart(t);
    }

    fireLongPressEnd(t: Touch) {
        this.recognizerContext.globalEvents._fireLongPressEnd(t);
    }

    hasSettledModifierTouch(now: number) {
        const { modifierTouch } = this.recognizerContext;
        return !!(modifierTouch && now - modifierTouch.started > TAP_TIME * 0.5);
    }

    hasModifierTouch() {
        return this.recognizerContext.modifierTouch !== null;
    }

    getDocumentActives() {
        return this.recognizerContext.documentActives;
    }

    getModifierTouch() {
        return this.recognizerContext.modifierTouch;
    }

    _recognizeOn(elem: HTMLElement | DomWrapper | Document, useCapture?: boolean) {
        const eventTypes = this._eventType;
        for (const type of eventTypes) {
            (elem as DomWrapper).addEventListener(type, this._recognizerHandler, {
                passive: PassiveTouchEventType.decode(type)._tag === `Right`,
                capture: !!useCapture,
            });
        }
    }

    _unrecognizeOn(elem: HTMLElement | DomWrapper | Document, useCapture?: boolean) {
        const eventTypes = this._eventType;

        for (const type of eventTypes) {
            (elem as DomWrapper).removeEventListener(type, this._recognizerHandler, {
                capture: !!useCapture,
            });
        }
    }

    recognizeBubbledOn(elem: HTMLElement | DomWrapper | Document) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._recognizeOn(elem, false);
    }

    unrecognizeBubbledOn(elem: HTMLElement | DomWrapper | Document) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._unrecognizeOn(elem, false);
    }

    recognizeCapturedOn(elem: HTMLElement | DomWrapper | Document) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._recognizeOn(elem, true);
    }

    unrecognizeCapturedOn(elem: HTMLElement | DomWrapper | Document) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._unrecognizeOn(elem, true);
    }
}
