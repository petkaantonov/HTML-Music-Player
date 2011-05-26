var player = player || {};

(function() {
player.main = new Player(".app-player-controls", playlist.main, {
    playButtonDom: ".play-button",
    pauseButtonDom: ".pause-button",
    previousButtonDom: ".previous-button",
    stopButtonDom: ".stop-button",
    nextButtonDom: ".next-button",
});

var playerTimeManager = new PlayerTimeManager(".player-upper-container", player.main, {
    seekSlider: new Slider(".time-progress-container"),
    currentTimeDom: ".current-time",
    totalTimeDom: ".total-time",
    timeContainerDom: ".playback-status-wrapper",
    timeProgressDom: ".time-progress"
});

var playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", player.main, {
    volumeSlider: new Slider(".volume-slider-container"),
    muteDom: ".volume-mute"
});

var playerPictureManager = new PlayerPictureManager(".picture-container", player.main);

var playlistNotifications = new PlaylistNotifications(".notification-setting", player.main);

/* To be used both with hotkeys and click binds */
player.methodPause = function() {
    player.main.pause();
};
player.methodPlay = function() {
    player.main.play();
};

player.methodStop = function() {
    player.main.stop();
};

player.methodNext = function() {
    playlist.main.next();
};

player.methodPrev = function() {
    playlist.main.prev();
};

player.main.on("stop", function() {
    playlist.trackDisplay.newTitle("");
    document.title = __PROJECT__TITLE;
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Volume up",
    description: "Increases volume by 1%.",
    handler: function() {
        player.main.setVolume(player.main.getVolume() + 0.01);
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Volume down",
    description: "Decreases volume by 1%.",
    handler: function() {
        player.main.setVolume(player.main.getVolume() - 0.01);
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Toggle mute",
    description: "Toggles mute.",
    handler: function() {
        player.main.toggleMute();
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Previous track",
    description: "Jumps to the previous track or, if no previous track is available, to the first track in the current playlist.",
    handler: player.methodPrev
});


hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Next track",
    description: "Jumps to the next track.",
    handler: player.methodNext
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Play",
    description: "Start playback.",
    handler: player.methodPlay
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Pause",
    description: "Pauses playback.",
    handler: player.methodPause
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Stop",
    description: "Stops playback.",
    handler: player.methodStop
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Normal mode",
    description: "Activate normal mode. In normal mode tracks are played consecutively in the order they appear on the playlist as a track finishes.",
    handler: function() {
        playlist.main.tryChangeMode("normal");
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Shuffle mode",
    description: "Activate shuffle mode. In shuffle mode the next track is randomly chosen from the playlist, preferring those tracks that haven't been played recently.",
    handler: function() {
        playlist.main.tryChangeMode("shuffle");
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Repeat mode",
    description: "Activate repeat mode. In repeat mode the next track picked is always the same track that just finished.",
    handler: function() {
        playlist.main.tryChangeMode("repeat");
    }
});


hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek forward",
    description: "Seeks forward by 1%.",
    handler: function() {
        var p = player.main.getProgress();
        if (p !== -1) {
            player.main.setProgress(p + 0.01);
        }
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek back",
    description: "Seeks back by 1%.",
    handler: function() {
        var p = player.main.getProgress();
        if (p !== -1) {
            player.main.setProgress(p - 0.01);
        }
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Toggle time display mode",
    description: "Toggle the time display mode between elapsed time and remaining time.",
    handler: function() {
        playerTimeManager.toggleDisplayMode();
    }
});

})()
