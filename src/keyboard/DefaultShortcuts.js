import {SHUFFLE_MODE,
        NORMAL_MODE,
        REPEAT_MODE} from "player/PlaylistController";
import {NEW_TRACK_LOAD_EVENT} from "player/PlayerController";

export default class DefaultShortcuts {
    constructor(deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.player = deps.player;
        this.playlist = deps.playlist;
        this.keyboardShortcuts = deps.keyboardShortcuts;
        this.playerTimeManager = deps.playerTimeManager;
        this.rippler = deps.rippler;
        this.gestureScreenFlasher = deps.gestureScreenFlasher;

        this.seekShortcut = null;
        this.seekValueToCommit = -1;

        this.commitSeek = this.commitSeek.bind(this);
        this.shortcutPause = this.shortcutPause.bind(this);
        this.shortcutPlay = this.shortcutPlay.bind(this);
        this.shortcutStop = this.shortcutStop.bind(this);
        this.shortcutNext = this.shortcutNext.bind(this);
        this.shortcutPrev = this.shortcutPrev.bind(this);
        this.shortcutVolumeUp = this.shortcutVolumeUp.bind(this);
        this.shortcutVolumeDown = this.shortcutVolumeDown.bind(this);
        this.shortcutTogglePlayback = this.shortcutTogglePlayback.bind(this);
        this.shortcutToggleMute = this.shortcutToggleMute.bind(this);
        this.shortcutToggleDisplayMode = this.shortcutToggleDisplayMode.bind(this);
        this.shortcutPlaylistNormal = this.shortcutPlaylistNormal.bind(this);
        this.shortcutPlaylistShuffle = this.shortcutPlaylistShuffle.bind(this);
        this.shortcutPlaylistRepeat = this.shortcutPlaylistRepeat.bind(this);
        this.shortcutSeekBack = this.shortcutSeekBack.bind(this);
        this.shortcutSeekForward = this.shortcutSeekForward.bind(this);
        this.screenTapped = this.screenTapped.bind(this);
        this.shortcutGestureTogglePlayback = this.shortcutGestureTogglePlayback.bind(this);
        this.shortcutGestureNext = this.shortcutGestureNext.bind(this);
        this.shortcutGesturePrev = this.shortcutGesturePrev.bind(this);
        this.enableGestures = this.enableGestures.bind(this);
        this.disableGestures = this.disableGestures.bind(this);

        this.nextGestureRecognizer =
            this.recognizerContext.createHorizontalTwoFingerSwipeRecognizer(this.shortcutGestureNext, 1);
        this.prevGestureRecognizer =
            this.recognizerContext.createHorizontalTwoFingerSwipeRecognizer(this.shortcutGesturePrev, -1);
        this.togglePlaybackGestureRecognizer =
            this.recognizerContext.createTwoFingerTapRecognizer(this.shortcutGestureTogglePlayback);
        this.rippleRecognizer =
            this.recognizerContext.createTapRecognizer(this.screenTapped);

        this.player.on(NEW_TRACK_LOAD_EVENT, this.playerLoadedNewTrack.bind(this));
        this.keyboardShortcuts.defaultContext.addShortcut(`z`, this.shortcutPlay);
        this.keyboardShortcuts.defaultContext.addShortcut([`x`, `MediaStop`], this.shortcutPause);
        this.keyboardShortcuts.defaultContext.addShortcut([`mod+ArrowRight`, `MediaTrackNext`], this.shortcutNext);
        this.keyboardShortcuts.defaultContext.addShortcut([`mod+ArrowLeft`, `MediaTrackPrevious`], this.shortcutPrev);
        this.keyboardShortcuts.defaultContext.addShortcut([`-`, `VolumeDown`], this.shortcutVolumeDown);
        this.keyboardShortcuts.defaultContext.addShortcut([`+`, `VolumeUp`], this.shortcutVolumeUp);
        this.keyboardShortcuts.defaultContext.addShortcut([` `, `MediaPlayPause`], this.shortcutTogglePlayback);
        this.keyboardShortcuts.defaultContext.addShortcut([`VolumeMute`, `alt+mod+m`], this.shortcutToggleMute);
        this.keyboardShortcuts.defaultContext.addShortcut(`alt+t`, this.shortcutToggleDisplayMode);
        this.keyboardShortcuts.defaultContext.addShortcut(`alt+n`, this.shortcutPlaylistNormal);
        this.keyboardShortcuts.defaultContext.addShortcut(`alt+s`, this.shortcutPlaylistShuffle);
        this.keyboardShortcuts.defaultContext.addShortcut(`alt+r`, this.shortcutPlaylistRepeat);
        this.keyboardShortcuts.defaultContext.addShortcut(`ArrowLeft`, this.shortcutSeekBack);
        this.keyboardShortcuts.defaultContext.addShortcut(`ArrowRight`, this.shortcutSeekForward);


        this.enableGestures();
        this.keyboardShortcuts.on(`disable`, this.disableGestures);
        this.keyboardShortcuts.on(`enable`, this.enableGestures);

        this.rippleRecognizer.recognizeCapturedOn(this.page.document());

    }

    playerLoadedNewTrack() {
        this.page.removeDocumentListener(`keyup`, this.commitSeek, true);
    }

    commitSeek(e) {
        if (e.key !== this.seekShortcut) return;
        this.page.removeDocumentListener(`keyup`, this.commitSeek, true);
        this.player.setProgress(this.seekValueToCommit);
        this.seekValueToCommit = -1;
    }

    shortcutPause() {
        this.player.pause();
    }

    shortcutPlay() {
        this.player.play();
    }

    shortcutStop() {
        this.player.stop();
    }

    shortcutNext() {
        this.playlist.next(true);
    }

    shortcutPrev() {
        this.playlist.prev();
    }

    shortcutVolumeUp() {
        this.player.setVolume(this.player.getVolume() - 0.01);
    }

    shortcutVolumeDown() {
        this.player.setVolume(this.player.getVolume() + 0.01);
    }

    shortcutTogglePlayback() {
        this.player.togglePlayback();
    }

    shortcutToggleMute() {
        this.player.toggleMute();
    }

    shortcutToggleDisplayMode() {
        this.playerTimeManager.toggleDisplayMode();
    }

    shortcutPlaylistNormal() {
        this.playlist.tryChangeMode(NORMAL_MODE);
    }

    shortcutPlaylistShuffle() {
        this.playlist.tryChangeMode(SHUFFLE_MODE);
    }

    shortcutPlaylistRepeat() {
        this.playlist.tryChangeMode(REPEAT_MODE);
    }

    shortcutSeekBack(e) {
        this.page.removeDocumentListener(`keyup`, this.commitSeek, true);

        let p;
        if (this.seekValueToCommit !== -1) {
            p = this.seekValueToCommit;
        } else {
            p = this.player.getProgress();
        }

        if (p !== -1) {
            this.seekValueToCommit = Math.max(Math.min(1, p - 0.01), 0);
            this.seekShortcut = e.key;
            this.page.addDocumentListener(`keyup`, this.commitSeek, true);
            this.player.seekIntent(this.seekValueToCommit);
        }
    }

    shortcutSeekForward(e) {
        this.page.removeDocumentListener(`keyup`, this.commitSeek, true);

        let p;
        if (this.seekValueToCommit !== -1) {
            p = this.seekValueToCommit;
        } else {
            p = this.player.getProgress();
        }

        if (p !== -1) {
            this.seekValueToCommit = Math.max(Math.min(1, p + 0.01), 0);
            this.seekShortcut = e.key;
            this.page.addDocumentListener(`keyup`, this.commitSeek, true);
            this.player.seekIntent(this.seekValueToCommit);
        }
    }

    screenTapped(e) {
        this.rippler.rippleAt(e.clientX, e.clientY, 35, `#aaaaaa`);
    }

    shortcutGestureTogglePlayback() {
        const gesture = this.player.isPlaying ? `pause` : `play`;
        this.gestureScreenFlasher.flashGesture(gesture);
        this.player.togglePlayback();
    }

    shortcutGestureNext() {
        this.gestureScreenFlasher.flashGesture(`next`);
        this.playlist.next(true);
    }

    shortcutGesturePrev() {
        this.gestureScreenFlasher.flashGesture(`previous`);
        this.playlist.prev();
    }

    enableGestures() {
        this.prevGestureRecognizer.recognizeCapturedOn(this.page.document());
        this.nextGestureRecognizer.recognizeCapturedOn(this.page.document());
        this.togglePlaybackGestureRecognizer.recognizeCapturedOn(this.page.document());
    }

    disableGestures() {
        this.prevGestureRecognizer.unrecognizeCapturedOn(this.page.document());
        this.nextGestureRecognizer.unrecognizeCapturedOn(this.page.document());
        this.togglePlaybackGestureRecognizer.unrecognizeCapturedOn(this.page.document());
    }
}
