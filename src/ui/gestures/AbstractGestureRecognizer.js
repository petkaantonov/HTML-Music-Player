import {DomWrapper} from "platform/dom/Page";
import {PASSIVE_TOUCH_EVENTS, TAP_TIME} from "ui/gestures/GestureRecognizerContext";

export default class AbstractGestureRecognizer {
    constructor(recognizerContext) {
        this.recognizerContext = recognizerContext;
    }

    page() {
        return this.recognizerContext.page;
    }

    fireLongPressStart(t) {
        this.recognizerContext.globalEvents._fireLongPressStart(t);
    }

    fireLongPressEnd(t) {
        this.recognizerContext.globalEvents._fireLongPressEnd(t);
    }

    hasSettledModifierTouch(now) {
        const {modifierTouch} = this.recognizerContext;
        return !!(modifierTouch && (now - modifierTouch.started > TAP_TIME * 0.5));
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

    _recognizeOn(elem, useCapture) {
        if (!elem || (typeof elem.nodeType !== `number` && !(elem instanceof DomWrapper))) {
            throw new TypeError(`elem is not a dom node`);
        }
        const eventTypes = this._eventType;
        for (let i = 0; i < eventTypes.length; ++i) {
            const type = eventTypes[i];
            elem.addEventListener(type, this._recognizerHandler, {
                passive: PASSIVE_TOUCH_EVENTS[type] === type,
                capture: !!useCapture
            });
        }
    }

    _unrecognizeOn(elem, useCapture) {
        if (!elem || (typeof elem.nodeType !== `number` && !(elem instanceof DomWrapper))) {
            throw new TypeError(`elem is not a dom node`);
        }
        const eventTypes = this._eventType;

        for (let i = 0; i < eventTypes.length; ++i) {
            const type = eventTypes[i];
            elem.removeEventListener(type, this._recognizerHandler, {
                passive: PASSIVE_TOUCH_EVENTS[type] === type,
                capture: !!useCapture
            });
        }
    }

    recognizeBubbledOn(elem) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._recognizeOn(elem, false);
    }

    unrecognizeBubbledOn(elem) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._unrecognizeOn(elem, false);
    }

    recognizeCapturedOn(elem) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._recognizeOn(elem, true);
    }

    unrecognizeCapturedOn(elem) {
        if (!this.recognizerContext.isTouchSupported()) return;
        this._unrecognizeOn(elem, true);
    }
}
