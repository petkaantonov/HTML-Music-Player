import { SelectDeps } from "ui/Application";
import Page from "ui/platform/dom/Page";
import PlayerController from "ui/player/PlayerController";
import PlayerTimeManager from "ui/player/PlayerTimeManager";
import PlaylistController from "ui/player/PlaylistController";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import HorizontalSwipeRecognizer from "ui/ui/gestures/HorizontalSwipeRecognizer";
import TapRecognizer from "ui/ui/gestures/TapRecognizer";
import GestureScreenFlasher from "ui/ui/GestureScreenFlasher";
import Rippler from "ui/ui/Rippler";

import KeyboardShortcuts from "./KeyboardShortcuts";

type Deps = SelectDeps<
    | "page"
    | "recognizerContext"
    | "player"
    | "playlist"
    | "keyboardShortcuts"
    | "playerTimeManager"
    | "rippler"
    | "gestureScreenFlasher"
>;

export default class DefaultShortcuts {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    player: PlayerController;
    playlist: PlaylistController;
    keyboardShortcuts: KeyboardShortcuts;
    playerTimeManager: PlayerTimeManager;
    rippler: Rippler;
    gestureScreenFlasher: GestureScreenFlasher;
    seekValueToCommit: number;
    nextGestureRecognizer: HorizontalSwipeRecognizer;
    prevGestureRecognizer: HorizontalSwipeRecognizer;
    rippleRecognizer: TapRecognizer;
    seekShortcut: string | null;

    constructor(deps: Deps) {
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
        this.shortcutGestureNext = this.shortcutGestureNext.bind(this);
        this.shortcutGesturePrev = this.shortcutGesturePrev.bind(this);
        this.enableGestures = this.enableGestures.bind(this);
        this.disableGestures = this.disableGestures.bind(this);

        this.nextGestureRecognizer = this.recognizerContext.createHorizontalSwipeRecognizer(
            this.shortcutGestureNext,
            1
        );
        this.prevGestureRecognizer = this.recognizerContext.createHorizontalSwipeRecognizer(
            this.shortcutGesturePrev,
            -1
        );
        this.rippleRecognizer = this.recognizerContext.createTapRecognizer(this.screenTapped);

        this.player.on("newTrackLoaded", this.playerLoadedNewTrack.bind(this));
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
        this.page.removeDocumentListener(`keyup`, this.commitSeek, { capture: true });
    }

    commitSeek(e: KeyboardEvent) {
        if (e.key !== this.seekShortcut) return;
        this.playerTimeManager.stopKeyboardSeeking();
        this.page.removeDocumentListener(`keyup`, this.commitSeek, { capture: true });
        this.player.setProgress(this.seekValueToCommit);
        this.seekValueToCommit = -1;
    }

    shortcutPause() {
        this.player.pause();
    }

    shortcutPlay(e: Event) {
        this.player.play(e);
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

    shortcutTogglePlayback(e: Event) {
        this.player.togglePlayback(e);
    }

    shortcutToggleMute() {
        this.player.toggleMute();
    }

    shortcutToggleDisplayMode() {
        this.playerTimeManager.toggleDisplayMode();
    }

    shortcutPlaylistNormal() {
        this.playlist.tryChangeMode("normal");
    }

    shortcutPlaylistShuffle() {
        this.playlist.tryChangeMode("shuffle");
    }

    shortcutPlaylistRepeat() {
        this.playlist.tryChangeMode("repeat");
    }

    shortcutSeekBack(e: KeyboardEvent) {
        this.page.removeDocumentListener(`keyup`, this.commitSeek, { capture: true });

        let p;
        if (this.seekValueToCommit !== -1) {
            p = this.seekValueToCommit;
        } else {
            p = this.player.getProgress();
        }

        if (p !== -1) {
            this.playerTimeManager.startKeyboardSeeking();
            this.seekValueToCommit = Math.max(Math.min(1, p - 0.01), 0);
            this.seekShortcut = e.key;
            this.page.addDocumentListener(`keyup`, this.commitSeek, { capture: true });
            this.playerTimeManager.showSeekTime(this.seekValueToCommit);
        }
    }

    shortcutSeekForward(e: KeyboardEvent) {
        this.page.removeDocumentListener(`keyup`, this.commitSeek, { capture: true });

        let p;
        if (this.seekValueToCommit !== -1) {
            p = this.seekValueToCommit;
        } else {
            p = this.player.getProgress();
        }

        if (p !== -1) {
            this.playerTimeManager.startKeyboardSeeking();
            this.seekValueToCommit = Math.max(Math.min(1, p + 0.01), 0);
            this.seekShortcut = e.key;
            this.page.addDocumentListener(`keyup`, this.commitSeek, { capture: true });
            this.playerTimeManager.showSeekTime(this.seekValueToCommit);
        }
    }

    screenTapped(e: GestureObject) {
        this.rippler.rippleAt(e.clientX, e.clientY, 35, `#aaaaaa`);
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
    }

    disableGestures() {
        this.prevGestureRecognizer.unrecognizeCapturedOn(this.page.document());
        this.nextGestureRecognizer.unrecognizeCapturedOn(this.page.document());
    }
}
