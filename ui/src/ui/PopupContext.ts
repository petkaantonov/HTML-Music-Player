import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import { PopupPreferenceKey, PreferenceArray, StoredKVValues } from "shared/src/preferences";
import { animationPromisify } from "shared/util";
import { SelectDeps } from "ui/Application";
import KeyboardShortcuts from "ui/keyboard/KeyboardShortcuts";
import Page, { BaseKeyFrames, DomWrapper } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import { DECELERATE_CUBIC } from "ui/ui/animation/easing";
import Popup, { PopupButtonOpts } from "ui/ui/Popup";

import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import TapRecognizer from "./gestures/TapRecognizer";
import Rippler from "./Rippler";
import ScrollerContext from "./scrolling/ScrollerContext";

const blockerAnimationKeyFrames: BaseKeyFrames = [{ opacity: 0 }, { opacity: 0.55 }];

const blockerShowAnimationOptions: KeyframeAnimationOptions = {
    fill: `both`,
    duration: 300,
    easing: DECELERATE_CUBIC,
};

const blockerHideAnimationOptions: KeyframeAnimationOptions = {
    ...blockerShowAnimationOptions,
    direction: `reverse`,
};

const popupOpacityAnimationKeyFrames: BaseKeyFrames = [{ opacity: 0 }, { opacity: 1 }];

const popupShowAnimationOptions: KeyframeAnimationOptions = {
    fill: `none`,
    duration: 300,
    easing: DECELERATE_CUBIC,
};

const popupHideAnimationOptions: KeyframeAnimationOptions = {
    ...popupShowAnimationOptions,
    direction: "reverse",
};

const popupTranslateAnimationOptions: KeyframeAnimationOptions = {
    fill: `both`,
    duration: 450,
    easing: DECELERATE_CUBIC,
    composite: "replace",
};

function getDesktopTransitionIn($node: DomWrapper, _rect: DOMRect) {
    return animationPromisify(
        $node.animate(
            $node.getScaleKeyFrames(0.95, 0.95, 1, 1, popupOpacityAnimationKeyFrames),
            popupShowAnimationOptions
        )
    );
}

function getDesktopTransitionOut($node: DomWrapper, _rect: DOMRect) {
    return animationPromisify($node.animate(popupOpacityAnimationKeyFrames, popupHideAnimationOptions));
}

function getMobileTransitionIn($node: DomWrapper, rect: DOMRect) {
    return animationPromisify($node.animateTranslate(-rect.width, 0, 0, 0, popupTranslateAnimationOptions));
}

function getMobileTransitionOut($node: DomWrapper, rect: DOMRect) {
    return animationPromisify($node.animateTranslate(0, 0, -rect.width, 0, popupTranslateAnimationOptions));
}

type Deps = SelectDeps<
    | "env"
    | "page"
    | "globalEvents"
    | "db"
    | "scrollerContext"
    | "recognizerContext"
    | "dbValues"
    | "keyboardShortcuts"
    | "rippler"
>;

interface Opts {
    zIndex: number;
}

export default class PopupContext {
    env: Env;
    page: Page;
    globalEvents: GlobalEvents;
    db: KeyValueDatabase;
    scrollerContext: ScrollerContext;
    recognizerContext: GestureRecognizerContext;
    dbValues: StoredKVValues;
    keyboardShortcuts: KeyboardShortcuts;
    rippler: Rippler;
    popupZIndex: number;
    shownPopups: Popup[];
    popups: Popup[];
    blocker: DomWrapper;
    animation: null | Animation;
    blockerTapRecognizer: TapRecognizer;
    constructor(opts: Opts, deps: Deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.db = deps.db;
        this.scrollerContext = deps.scrollerContext;
        this.recognizerContext = deps.recognizerContext;
        this.dbValues = deps.dbValues;
        this.keyboardShortcuts = deps.keyboardShortcuts;
        this.rippler = deps.rippler;

        this.popupZIndex = opts.zIndex;

        this.shownPopups = [];
        this.popups = [];
        this.blocker = this.page.NULL();
        this.animation = null;

        this.globalEvents.on(`clear`, this.closeTopPopup);
        this.globalEvents.on(`backbuttonPress`, this.closeTopPopup);
        this.globalEvents.on("shutdownSavePreferences", this._shutdownSavePreferences);

        this.blockerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closePopups);
    }

    getAnimationDuration() {
        return this.isMobile() ? 450 : 300;
    }

    isMobile() {
        return this.env.hasTouch();
    }

    closePopups = () => {
        this.shownPopups.forEach(p => p.close());
    };

    showBlocker = () => {
        if (this.isMobile()) {
            return;
        }
        if (this.animation) {
            this.animation.finish();
            this.animation = null;
            this.blocker.remove();
        }

        this.blocker = this.page.createElement(`div`, { class: `popup-blocker` }).appendTo(`body`);
        this.blocker.addEventListener(`click`, this.closePopups);
        this.blockerTapRecognizer.recognizeBubbledOn(this.blocker);
        this.blocker.animate(blockerAnimationKeyFrames, blockerShowAnimationOptions);
    };

    hideBlocker = async () => {
        if (!this.blocker.length) return;

        const animation = this.blocker.animate(blockerAnimationKeyFrames, {
            ...blockerHideAnimationOptions,
            duration: this.getAnimationDuration(),
        });
        this.animation = animation;
        await animationPromisify(animation);

        if (this.animation) {
            this.animation = null;
            this.blockerTapRecognizer.unrecognizeBubbledOn(this.blocker);
            this.blocker.remove();
            this.blocker = this.page.NULL();
        }
    };

    closeTopPopup = () => {
        if (this.shownPopups.length > 0) {
            void this.shownPopups.last()!.close();
        }
    };

    popupOpened = (popup: Popup) => {
        this.keyboardShortcuts.disable();

        if (this.shownPopups.push(popup) === 1) {
            this.showBlocker();
        }
    };

    _shutdownSavePreferences = (preferences: PreferenceArray) => {
        for (const popup of this.popups) {
            preferences.push({
                key: popup.preferenceKey,
                value: {
                    screenPosition: popup.getScreenPosition(),
                    scrollPosition: popup.getScrollPosition(),
                },
            });
        }
    };

    popupClosed = (popup: Popup) => {
        const key = popup.preferenceKey;
        const value = {
            screenPosition: popup.getScreenPosition(),
            scrollPosition: popup.getScrollPosition(),
        };
        void this.db.set(key, value);
        this.dbValues[key] = value;
        const index = this.shownPopups.indexOf(popup);
        if (index >= 0) {
            this.shownPopups.splice(index, 1);
            if (this.shownPopups.length === 0) {
                this.keyboardShortcuts.enable();
                void this.hideBlocker();
            }
        }
    };

    getTransitionInHandler() {
        return ($node: DomWrapper, rect: DOMRect) =>
            this.isMobile() ? getMobileTransitionIn($node, rect) : getDesktopTransitionIn($node, rect);
    }

    getTransitionOutHandler() {
        return ($node: DomWrapper, rect: DOMRect) =>
            this.isMobile() ? getMobileTransitionOut($node, rect) : getDesktopTransitionOut($node, rect);
    }

    makePopup = (
        title: (() => string) | string,
        body: (() => string) | string,
        preferenceKey: PopupPreferenceKey,
        footerButtons?: PopupButtonOpts[]
    ) => {
        const popup = new Popup(
            {
                preferenceKey,
                zIndex: this.popupZIndex,
                footerButtons,
                title,
                body,
                beforeTransitionIn: this.getTransitionInHandler(),
                beforeTransitionOut: this.getTransitionOutHandler(),
            },
            this
        );

        popup.on(`open`, this.popupOpened);
        popup.on(`close`, this.popupClosed);

        const preferences = this.dbValues[preferenceKey];

        if (preferences) {
            if (preferences.screenPosition) {
                popup.setScreenPosition(preferences.screenPosition);
            }
            popup.setScrollPosition(preferences.scrollPosition);
        }

        this.popups.push(popup);

        return popup;
    };
}
