import {slugTitle, noUndefinedGet, animationPromisify, _} from "util";
import {DECELERATE_CUBIC} from "ui/animation/easing";
import Popup from "ui/Popup";
import withDeps from "ApplicationDependencies";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";

const blockerAnimationKeyFrames = [
    {opacity: 0},
    {opacity: 0.55}
];

const blockerShowAnimationOptions = {
    fill: `both`,
    duration: 300,
    easing: DECELERATE_CUBIC
};

const blockerHideAnimationOptions = Object.assign({direction: `reverse`}, blockerShowAnimationOptions);


const popupOpacityAnimationKeyFrames = [
    {opacity: 0},
    {opacity: 1}
];

const popupShowAnimationOptions = {
    fill: `none`,
    duration: 300,
    easing: DECELERATE_CUBIC
};

const popupHideAnimationOptions = Object.assign({direction: `reverse`}, popupShowAnimationOptions);

const popupTranslateAnimationOptions = {
    fill: `both`,
    duration: 450,
    easing: DECELERATE_CUBIC,
    noComposite: true
};

function toPreferenceKey(popupTitle) {
        return `${slugTitle(popupTitle)}-popup-preferences`;
}

function withDuration(opts, duration) {
    opts.duration = duration;
    return opts;
}

function getDesktopTransitionIn($node) {
    return animationPromisify($node.animate($node.getScaleKeyFrames(0.95, 0.95, 1, 1, popupOpacityAnimationKeyFrames),
                                            popupShowAnimationOptions));
}

function getDesktopTransitionOut($node) {
    return animationPromisify($node.animate(popupOpacityAnimationKeyFrames,
                                            popupHideAnimationOptions));
}

function getMobileTransitionIn($node, rect) {
    return animationPromisify($node.animateTranslate(-rect.width, 0, 0, 0, popupTranslateAnimationOptions));
}

function getMobileTransitionOut($node, rect) {
    return animationPromisify($node.animateTranslate(0, 0, -rect.width, 0, popupTranslateAnimationOptions));
}

export default class PopupContext {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);

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
        this.containerClass = opts.containerClass;
        this.headerClass = opts.headerClass;
        this.footerClass = opts.footerClass;
        this.bodyClass = opts.bodyClass;
        this.bodyContentClass = opts.bodyContentClass;
        this.closerContainerClass = opts.closerContainerClass;
        this.popupButtonClass = opts.popupButtonClass;
        this.buttonDisabledClass = opts.buttonDisabledClass;

        this.shownPopups = [];
        this.popups = [];
        this.blocker = this.page.NULL();
        this.animation = null;

        this.closeTopPopup = this.closeTopPopup.bind(this);
        this.popupOpened = this.popupOpened.bind(this);
        this.popupClosed = this.popupClosed.bind(this);
        this.closePopups = this.closePopups.bind(this);

        this.globalEvents.on(`clear`, this.closeTopPopup);
        this.globalEvents.on(`backbuttonPress`, this.closeTopPopup);
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));

        this.blockerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closePopups);
    }

    getAnimationDuration() {
        return this.isMobile() ? 450 : 300;
    }

    isMobile() {
        return this.env.hasTouch();
    }

    closePopups() {
        this.shownPopups.forEach(_.close);
    }

    showBlocker() {
        if (this.isMobile()) {
            return;
        }
        if (this.animation) {
            this.animation.finish();
            this.animation = null;
            this.blocker.remove();
        }

        this.blocker = this.page.createElement(`div`, {class: `popup-blocker`}).appendTo(`body`);
        this.blocker.addEventListener(`click`, this.closePopups);
        this.blockerTapRecognizer.recognizeBubbledOn(this.blocker);
        this.blocker.animate(blockerAnimationKeyFrames, blockerShowAnimationOptions);
    }

    async hideBlocker() {
        if (!this.blocker.length) return;

        const animation = this.blocker.animate(blockerAnimationKeyFrames,
                                               withDuration(blockerHideAnimationOptions, this.getAnimationDuration()));
        this.animation = animation;
        await animationPromisify(animation);

        if (this.animation) {
            this.animation = null;
            this.blockerTapRecognizer.unrecognizeBubbledOn(this.blocker);
            this.blocker.remove();
            this.blocker = this.page.NULL();
        }
    }

    closeTopPopup() {
        if (this.shownPopups.length > 0) {
            this.shownPopups.last().close();

        }
    }

    popupOpened(popup) {
        this.keyboardShortcuts.disable();

        if (this.shownPopups.push(popup) === 1) {
            this.showBlocker();
        }
    }

    _shutdownSavePreferences(preferences) {
        for (const popup of this.popups) {
            preferences.push({
                key: toPreferenceKey(popup.title()),
                value: {
                    screenPosition: popup.getScreenPosition(),
                    scrollPosition: popup.getScrollPosition()
                }
            });
        }
    }

    popupClosed(popup) {
        const index = this.shownPopups.indexOf(popup);
        if (index >= 0) {
            this.shownPopups.splice(index, 1);
            if (this.shownPopups.length === 0) {
                this.keyboardShortcuts.enable();
                this.hideBlocker();
            }
        }
    }

    getTransitionInHandler() {
        return (($node, rect) =>
            (this.isMobile() ? getMobileTransitionIn($node, rect) : getDesktopTransitionIn($node, rect)));
    }

    getTransitionOutHandler() {
        return (($node, rect) =>
            (this.isMobile() ? getMobileTransitionOut($node, rect) : getDesktopTransitionOut($node, rect)));
    }

    makePopup(title, body, footerButtons) {
        const {containerClass, headerClass, footerClass, bodyClass,
                bodyContentClass, closerContainerClass, popupButtonClass, buttonDisabledClass,
                page, env, globalEvents, recognizerContext, scrollerContext, rippler} = this;
        const popup = withDeps({env, page, globalEvents, recognizerContext, scrollerContext, rippler}, deps => new Popup({
            containerClass,
            headerClass,
            footerClass,
            bodyClass,
            bodyContentClass,
            closerContainerClass,
            popupButtonClass,
            buttonDisabledClass,
            zIndex: this.popupZIndex,
            footerButtons,
            title,
            body,
            closer: `<span class="icon glyphicon glyphicon-remove"></span>`,
            beforeTransitionIn: this.getTransitionInHandler(),
            beforeTransitionOut: this.getTransitionOutHandler()
        }, deps));

        popup.on(`open`, this.popupOpened);
        popup.on(`close`, this.popupClosed);

        const preferenceKey = toPreferenceKey(popup.title());

        if (preferenceKey in this.dbValues) {
            const data = Object(this.dbValues[preferenceKey]);
            popup.setScreenPosition(data.screenPosition);
            popup.setScrollPosition(data.scrollPosition);
        }
        this.popups.push(popup);

        return popup;
    }
}
