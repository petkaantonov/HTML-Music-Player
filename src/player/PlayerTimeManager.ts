import { SelectDeps, TimeDisplayPreference } from "Application";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import GlobalEvents from "platform/GlobalEvents";
import KeyValueDatabase from "platform/KeyValueDatabase";
import { PreferenceArray } from "preferences/PreferenceCreator";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import Rippler from "ui/Rippler";
import Slider from "ui/Slider";

import { toTimeString } from "../util";
import PlayerController from "./PlayerController";

type Deps = SelectDeps<
    "page" | "recognizerContext" | "rippler" | "player" | "globalEvents" | "db" | "sliderContext" | "dbValues"
>;

interface Opts {
    seekSlider: DomWrapperSelector;
    totalTimeDom: DomWrapperSelector;
    currentTimeDom: DomWrapperSelector;
    timeProgressDom: DomWrapperSelector;
}

export default class PlayerTimeManager {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    player: PlayerController;
    globalEvents: GlobalEvents;
    db: KeyValueDatabase;
    displayMode: TimeDisplayPreference;
    private _seekingFromSlider: boolean;
    private _seekingFromKeyboard: boolean;
    totalTime: number;
    currentTime: number;
    seekSlider: Slider;
    private _displayedTimeRight: number;
    private _displayedTimeLeft: number;
    private _totalTimeDomNode: DomWrapper;
    private _currentTimeDomNode: DomWrapper;
    private _timeProgressDomNode: DomWrapper;
    hidden: boolean;
    frameId: number;
    private _hideTimerId: number;

    constructor(opts: Opts, deps: Deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.player = deps.player;
        this.globalEvents = deps.globalEvents;
        this.db = deps.db;

        this.displayMode = deps.dbValues.timeDisplayPreference ?? "remaining";
        this._seekingFromSlider = false;
        this._seekingFromKeyboard = false;
        this.totalTime = 0;
        this.currentTime = 0;
        this.seekSlider = deps.sliderContext.createSlider({
            target: opts.seekSlider,
            updateDom: false,
        });
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        this._totalTimeDomNode = this.page.$(opts.totalTimeDom);
        this._currentTimeDomNode = this.page.$(opts.currentTimeDom);
        this._timeProgressDomNode = this.page.$(opts.timeProgressDom);

        this.hidden = true;
        this.frameId = -1;

        this.seekSlider.on(`slideBegin`, this.slideBegun);
        this.seekSlider.on(`slideEnd`, this.slideEnded);
        this.seekSlider.on(`slide`, this.slided);
        this.player.on("playbackProgressed", this.playerTimeProgressed);
        this.player.on("newTrackLoaded", this.newTrackLoaded);
        this.globalEvents.on("shutdownSavePreferences", this._shutdownSavePreferences);

        this.$totalTime().addEventListener(`click`, this.containerClicked);
        this.recognizerContext.createTapRecognizer(this.containerClicked).recognizeBubbledOn(this.$totalTime());

        this._hideTimerId = -1;
        this._scheduleUpdate();
    }

    $timeProgress() {
        return this._timeProgressDomNode;
    }

    $currentTime() {
        return this._currentTimeDomNode;
    }

    $totalTime() {
        return this._totalTimeDomNode;
    }

    startKeyboardSeeking = () => {
        this._seekingFromKeyboard = true;
    };

    stopKeyboardSeeking = () => {
        this._seekingFromKeyboard = false;
    };

    slideBegun = () => {
        this._seekingFromSlider = true;
    };

    slideEnded = (percentage?: number) => {
        this._seekingFromSlider = false;
        if (this.player.isStopped || percentage === undefined) return;
        this.showSeekTime(percentage);
        const duration = this.player.getDuration();
        if (duration) {
            this.player.seek(duration * percentage);
        }
    };

    slided = (percentage: number) => {
        if (this.player.isStopped) return;
        this.showSeekTime(percentage);
    };

    showSeekTime = (progress: number) => {
        if (!this._isShowingProgressFromSeek()) return;
        progress = Math.min(1, Math.max(0, progress));
        const duration = this.player.getDuration();
        if (duration) {
            this.setTimes(duration * progress, null);
        }
    };

    playerTimeProgressed = (playedTime: number, totalTime: number) => {
        if (this._isShowingProgressFromSeek()) return;
        this.setTimes(playedTime, totalTime);
    };

    _updateTimeText = () => {
        this.$currentTime().setText(toTimeString(this._displayedTimeLeft));
        this.$totalTime().setText(toTimeString(this._displayedTimeRight));
    };

    setTimes = (currentTime?: number | null, totalTime?: number | null) => {
        this._scheduleUpdate();
        if (totalTime !== null && totalTime !== undefined) {
            this.checkVisibility(totalTime);
            if (this.displayMode === "elapsed") {
                const totalTimeFloored = Math.floor(totalTime);
                if (this._displayedTimeRight !== totalTimeFloored) {
                    this._displayedTimeRight = totalTimeFloored;
                    this.page.changeDom(this._updateTimeText);
                }
            }

            this.totalTime = totalTime;
        }

        if (currentTime !== null && currentTime !== undefined) {
            const currentTimeFloored = Math.floor(currentTime);

            if (this._displayedTimeLeft !== currentTimeFloored) {
                this._displayedTimeLeft = currentTimeFloored;
                this.page.changeDom(this._updateTimeText);

                if (this.displayMode === "remaining") {
                    this._displayedTimeRight = -Math.floor(Math.max(0, this.totalTime - currentTime));
                }
            }
            this.currentTime = currentTime;
        }
    };

    _updateProgress = () => {
        this.frameId = -1;
        let percentage;
        if (this.currentTime === 0 || this.totalTime === 0) {
            percentage = 0;
        } else {
            percentage = (this.currentTime / this.totalTime) * 100;
        }
        this.$timeProgress().setTransform(`translate3d(${percentage - 100}%,0,0)`);
    };

    _scheduleUpdate = () => {
        if (this.frameId === -1) {
            this.frameId = this.page.requestAnimationFrame(this._updateProgress);
        }
    };

    forceUpdate = () => {
        const { currentTime, totalTime } = this;
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        this.currentTime = currentTime + 1;
        this.totalTime = totalTime + 1;
        this.setTimes(currentTime, totalTime);
        this._scheduleUpdate();
    };

    toggleDisplayMode = () => {
        if (this.displayMode === "elapsed") {
            this.displayMode = "remaining";
        } else {
            this.displayMode = "elapsed";
        }
        this.forceUpdate();
        this._persistDisplayMode();
    };

    containerClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        this.toggleDisplayMode();
    };

    _persistDisplayMode = () => {
        void this.db.set("timeDisplayPreference", this.displayMode);
    };

    _shutdownSavePreferences = (preferences: PreferenceArray) => {
        preferences.push({
            key: "timeDisplayPreference",
            value: this.displayMode,
        });
    };

    _hide = () => {
        if (this.hidden) return;
        this.hidden = true;
        this.$currentTime().addClass(`hidden`);
        this.$totalTime().addClass(`hidden`);
    };

    _clearHideTimer = () => {
        if (this._hideTimerId !== -1) {
            this.page.clearTimeout(this._hideTimerId);
            this._hideTimerId = -1;
        }
    };

    _startHideTimer = () => {
        this._hideTimerId = this.page.setTimeout(() => {
            this._hide();
        }, 5000);
    };

    hide = () => {
        this._clearHideTimer();
        this._startHideTimer();
    };

    show = () => {
        this._clearHideTimer();
        if (!this.hidden) return;
        this.hidden = false;
        this.$currentTime().removeClass(`hidden`);
        this.$totalTime().removeClass(`hidden`);
        this._updateTimeText();
    };

    checkVisibility = (duration: number) => {
        if (duration === 0) {
            this.hide();
        } else {
            this.show();
        }
    };

    _isShowingProgressFromSeek = () => {
        return this._seekingFromSlider || this._seekingFromKeyboard;
    };

    newTrackLoaded = () => {
        if (this._isShowingProgressFromSeek()) return;
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        const duration = Math.max(this.player.getProbableDuration() || 0, 0);
        this.checkVisibility(duration);
        this.currentTime = -1;
        this.setTimes(0, duration);
        this._scheduleUpdate();
        this._updateTimeText();
    };
}
