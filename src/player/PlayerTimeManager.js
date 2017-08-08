import {toTimeString, noUndefinedGet} from "util";
import {PROGRESS_EVENT,
        NEW_TRACK_LOAD_EVENT} from "player/PlayerController";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";

const DISPLAY_ELAPSED = 0;
const DISPLAY_REMAINING = 1;

const TIME_DISPLAY_PREFERENCE_KEY = `time-display`;

export default class PlayerTimeManager {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);

        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.player = deps.player;
        this.globalEvents = deps.globalEvents;
        this.db = deps.db;

        this.displayMode = DISPLAY_REMAINING;
        this._seekingFromSlider = false;
        this._seekingFromKeyboard = false;
        this.totalTime = 0;
        this.currentTime = 0;
        this.seekSlider = deps.sliderContext.createSlider({
            target: opts.seekSlider,
            updateDom: false
        });
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        this._transitionEnabled = false;
        this._totalTimeDomNode = this.page.$(opts.totalTimeDom);
        this._currentTimeDomNode = this.page.$(opts.currentTimeDom);
        this._timeProgressDomNode = this.page.$(opts.timeProgressDom);
        this._updateProgress = this._updateProgress.bind(this);
        this.hidden = true;
        this.frameId = -1;

        this.slideBegun = this.slideBegun.bind(this);
        this.slideEnded = this.slideEnded.bind(this);
        this.slided = this.slided.bind(this);
        this.playerTimeProgressed = this.playerTimeProgressed.bind(this);
        this.containerClicked = this.containerClicked.bind(this);
        this.newTrackLoaded = this.newTrackLoaded.bind(this);
        this._updateTimeText = this._updateTimeText.bind(this);

        this.seekSlider.on(`slideBegin`, this.slideBegun);
        this.seekSlider.on(`slideEnd`, this.slideEnded);
        this.seekSlider.on(`slide`, this.slided);
        this.player.on(PROGRESS_EVENT, this.playerTimeProgressed);
        this.player.on(NEW_TRACK_LOAD_EVENT, this.newTrackLoaded);
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));

        this.$totalTime().addEventListener(`click`, this.containerClicked);
        this.recognizerContext.createTapRecognizer(this.containerClicked).recognizeBubbledOn(this.$totalTime());

        this._hideTimerId = -1;

        if (TIME_DISPLAY_PREFERENCE_KEY in deps.dbValues) {
            const val = +deps.dbValues[TIME_DISPLAY_PREFERENCE_KEY];
            if (val === DISPLAY_REMAINING || val === DISPLAY_ELAPSED) {
                this.displayMode = val;
            }
        }

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

    startKeyboardSeeking() {
        this._seekingFromKeyboard = true;
    }

    stopKeyboardSeeking() {
        this._seekingFromKeyboard = false;
    }

    slideBegun() {
        this._seekingFromSlider = true;
    }

    slideEnded(percentage) {
        this._seekingFromSlider = false;
        if (this.player.isStopped) return;
        this.showSeekTime(percentage);
        const duration = this.player.getDuration();
        if (duration) {
            this.player.seek(duration * percentage);
        }
    }

    slided(percentage) {
        if (this.player.isStopped) return;
        this.showSeekTime(percentage);
    }

    showSeekTime(progress) {
        if (!this._isShowingProgressFromSeek()) return;
        progress = Math.min(1, Math.max(0, progress));
        const duration = this.player.getDuration();
        if (duration) {
            this.setTimes(duration * progress, null);
        }
    }

    playerTimeProgressed(playedTime, totalTime) {
        if (this._isShowingProgressFromSeek()) return;
        this.setTimes(playedTime, totalTime);
    }

    _updateTimeText() {
        this.$currentTime().setText(toTimeString(this._displayedTimeLeft));
        this.$totalTime().setText(toTimeString(this._displayedTimeRight));
    }

    setTimes(currentTime, totalTime) {
        this._scheduleUpdate();
        if (totalTime !== null) {
            this.checkVisibility(totalTime);
            if (this.displayMode === DISPLAY_ELAPSED) {
                const totalTimeFloored = Math.floor(totalTime);
                if (this._displayedTimeRight !== totalTimeFloored) {
                    this._displayedTimeRight = totalTimeFloored;
                    this.page.changeDom(this._updateTimeText);
                }
            }

            this.totalTime = totalTime;
        }

        if (currentTime !== null) {
            const currentTimeFloored = Math.floor(currentTime);

            if (this._displayedTimeLeft !== currentTimeFloored) {
                this._displayedTimeLeft = currentTimeFloored;
                this.page.changeDom(this._updateTimeText);

                if (this.displayMode === DISPLAY_REMAINING) {
                    this._displayedTimeRight = -(Math.floor(Math.max(0, this.totalTime - currentTime)));
                }
            }
            this.currentTime = currentTime;
        }
    }

    _updateProgress() {
        this.frameId = -1;
        let percentage;
        if (this.currentTime === 0 || this.totalTime === 0) {
            percentage = 0;
        } else {
            percentage = this.currentTime / this.totalTime * 100;
        }
        this.$timeProgress().setTransform(`translate3d(${percentage - 100}%,0,0)`);
    }

    _scheduleUpdate() {
        if (this.frameId === -1) {
            this.frameId = this.page.requestAnimationFrame(this._updateProgress);
        }
    }

    forceUpdate() {
        const {currentTime, totalTime} = this;
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        this.currentTime = currentTime + 1;
        this.totalTime = totalTime + 1;
        this.setTimes(currentTime, totalTime);
        this._scheduleUpdate();
    }


    toggleDisplayMode() {
        if (this.displayMode === DISPLAY_ELAPSED) {
            this.displayMode = DISPLAY_REMAINING;
        } else {
            this.displayMode = DISPLAY_ELAPSED;
        }
        this.forceUpdate();
        this._persistDisplayMode();
    }

    containerClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.toggleDisplayMode();
    }

    _persistDisplayMode() {
        this.db.set(TIME_DISPLAY_PREFERENCE_KEY, this.displayMode);
    }

    _shutdownSavePreferences(preferences) {
        preferences.push({
            key: TIME_DISPLAY_PREFERENCE_KEY,
            value: this.displayMode
        });
    }

    _hide() {
        if (this.hidden) return;
        this.hidden = true;
        this.$currentTime().addClass(`hidden`);
        this.$totalTime().addClass(`hidden`);
    }

    _clearHideTimer() {
        if (this._hideTimerId !== -1) {
            this.page.clearTimeout(this._hideTimerId);
            this._hideTimerId = -1;
        }
    }

    _startHideTimer() {
        this._hideTimerId = this.page.setTimeout(() => {
            this._hide();
        }, 5000);
    }

    hide() {
        this._clearHideTimer();
        this._startHideTimer();
    }

    show() {
        this._clearHideTimer();
        if (!this.hidden) return;
        this.hidden = false;
        this.$currentTime().removeClass(`hidden`);
        this.$totalTime().removeClass(`hidden`);
        this._updateTimeText();
    }

    checkVisibility(duration) {
        if (duration === 0) {
            this.hide();
        } else {
            this.show();
        }
    }

    _isShowingProgressFromSeek() {
        return this._seekingFromSlider || this._seekingFromKeyboard;
    }

    newTrackLoaded() {
        if (this._isShowingProgressFromSeek()) return;
        this._displayedTimeRight = this._displayedTimeLeft = -1;
        const duration = Math.max(this.player.getProbableDuration() || 0, 0);
        this.checkVisibility(duration);
        this.currentTime = -1;
        this.setTimes(0, duration);
        this._scheduleUpdate();
        this._updateTimeText();
    }
}
