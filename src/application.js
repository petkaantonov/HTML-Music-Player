"use strict";
var desc = {value: function() {return ""}, writable: false, configurable: false};
try {
    Object.defineProperties(window, {
        alert: desc,
        prompt: desc,
        confirm: desc
    });
} catch (e) {}
window.$ = window.jQuery = require("lib/jquery");
window.Promise = require("lib/bluebird");
require("BluebirdConfig");
require("lib/jquery.fileinput");
require("lib/jquery.reflow");

const $ = window.$;

window.__PROJECT__TITLE = "Soita";

const features = require("features");
const keyValueDatabase = require("KeyValueDatabase");

var requiredFeaturesChecked = Promise.map(Object.keys(features.requiredFeatures), function(description) {
    var checker = features.requiredFeatures[description][0];
    var canIUseUrl = features.requiredFeatures[description][1];
    var apiName = features.requiredFeatures[description][2];
    return checker().catch(function(e) {return false}).then(function(result) {
        return {
            supported: result,
            canIUseUrl: canIUseUrl,
            apiName: apiName,
            description: description
        };
    });
}).then(function(featureResults) {
    var featureMissing = featureResults.some(function(v) {return !v.supported;});

    if (featureMissing) {
        return cssLoaded(Promise).then(function() {
            $("#app-load-text").remove();
            $("#app-loader .missing-features").removeClass("no-display");

            featureResults.forEach(function(v) {
                if (!v.supported) {
                    console.log("appending");
                    var link = $("<a>", {
                        target: "_blank",
                        class: "link-text",
                        href: v.canIUseUrl
                    }).text(v.apiName);

                    var children = [
                        $("<span>").text(v.description),
                        $("<sup>").append(link)
                    ];

                    $("<li>", {class: "missing-feature-list-item"})
                        .append(children)
                        .appendTo($("#app-loader .missing-features .missing-feature-list"));
                }
            });

            if (featureMissing) {
                throw new Error("missing features");
            }
        });

    }
});

var databaseInitialValuesLoaded = Promise.resolve();
if (keyValueDatabase) {
    databaseInitialValuesLoaded = keyValueDatabase.getInitialValues();
}

Promise.join(cssLoaded(Promise), requiredFeaturesChecked, databaseInitialValuesLoaded, function() {
$("#app-loader").remove();
$("#app-container").show();

const util = require("lib/util");
const serviceWorkerManager = require("ServiceWorkerManager");
const TrackDisplay = require("ui/TrackDisplay");
const Player = require("Player");
const Playlist = require("Playlist");
const ActionMenu = require("ui/ActionMenu");
const PlaylistModeManager = require("ui/PlaylistModeManager");
const PlayerTimeManager = require("ui/PlayerTimeManager");
const Slider = require("ui/Slider");
const PlayerVolumeManager = require("ui/PlayerVolumeManager");
const PlayerPictureManager = require("ui/PlayerPictureManager");
const PlaylistNotifications = require("ui/PlaylistNotifications");
const VisualizerCanvas = require("ui/VisualizerCanvas");
const TrackAnalyzer = require("audio/TrackAnalyzer");
const LocalFiles = require("LocalFiles");
const GlobalUi = require("ui/GlobalUi");
const touch = require("features").touch;
const domUtil = require("lib/DomUtil");
const gestureScreenFlasher = require("ui/GestureScreenFlasher");
const TrackRating = require("TrackRating");
const Track = require("Track");
const OpenableSubmenu = require("ui/OpenableSubmenu");
const KeyboardShortcuts = require("ui/KeyboardShortcuts");
const mainTabs = require("main_tabs");

const visualizerEnabledMediaMatcher = matchMedia("(min-height: 500px)");

serviceWorkerManager.start();

window.playlist = {};
window.player = {};
window.GlobalUi = GlobalUi;
window.serviceWorkerManager = serviceWorkerManager;

playlist.trackDisplay = new TrackDisplay("track-display", {
    delay: 5
});

playlist.main = mainTabs.playlist;



$(window).on("clear", function() {
    playlist.main.clearSelection();
});

$(document).on("longPressStart", function(e, touch) {
    GlobalUi.spinner.spinAt(touch.clientX|0, touch.clientY|0);
});

$(document).on("longPressEnd", function() {
    GlobalUi.spinner.stop();
});

const actions = {
    selectNone: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.clearSelection();
    },
    selectAll: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.selectAll();
    },
    play: function() {
        playlist.main.playPrioritySelection();
    },
    delete: function() {
        playlist.main.removeSelected();
    },
    sortByTitle: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByTitle();
    },
    sortByArtist: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByArtist();
    },
    sortByAlbumArtist: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByAlbumArtist();
    },
    sortByAlbum: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByAlbum();
    },
    sortByRating: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByRating();
    },
    sortByDuration: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByDuration();
    },
    sortByReverseOrder: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByReverseOrder();
    },
    sortByShuffling: function(e) {
        if (e && e.preventDefault) e.preventDefault();
        playlist.main.sortByShuffling();
    }
};

const trackActionsSpec = {
    menu: [{
        id: "play",
        disabled: true,
        content: GlobalUi.contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
        onClick: actions.play
    }, {
        id: "delete",
        disabled: true,
        content: GlobalUi.contextMenuItem("Delete", "material-icons small-material-icon delete"),
        onClick: actions.delete
    }, {
        divider: true,
    }, {
        id: "clear-selection",
        disabled: true,
        content: GlobalUi.contextMenuItem("Select none", "material-icons small-material-icon crop_square"),
        onClick: actions.selectNone
    }, {
        id: "select-all",
        disabled: true,
        content: GlobalUi.contextMenuItem("Select all", "material-icons small-material-icon select_all"),
        onClick: actions.selectAll
    }, {
        id: "sort",
        disabled: true,
        content: GlobalUi.contextMenuItem("Sort by", "glyphicon glyphicon-sort"),
        children: [{
            id: "sort-by-album",
            content: GlobalUi.contextMenuItem("Album", "material-icons small-material-icon album"),
            onClick: actions.sortByAlbum
        }, {
            id: "sort-by-artist",
            content: GlobalUi.contextMenuItem("Artist", "material-icons small-material-icon mic"),
            onClick: actions.sortByArtist

        }, {
            id: "sort-by-album-artist",
            content: GlobalUi.contextMenuItem("Album artist", "material-icons small-material-icon perm_camera_mic"),
            onClick: actions.sortByAlbumArtist

        }, {
            id: "sort-by-title",
            content: GlobalUi.contextMenuItem("Title", "material-icons small-material-icon music_note"),
            onClick: actions.sortByAlbum

        }, {
            id: "sort-by-rating",
            content: GlobalUi.contextMenuItem("Rating", "material-icons small-material-icon grade"),
            onClick: actions.sortByRating

        }, {
            id: "sort-by-duration",
            content: GlobalUi.contextMenuItem("Duration", "material-icons small-material-icon access_time"),
            onClick: actions.sortByDuration
        }, {
            divider: true
        }, {
            id: "sort-by-shuffling",
            content: GlobalUi.contextMenuItem("Shuffle", "material-icons small-material-icon shuffle"),
            onClick: actions.sortByShuffling
        }, {
            id: "sort-by-reverse-order",
            content: GlobalUi.contextMenuItem("Reverse order", "material-icons small-material-icon undo"),
            onClick: actions.sortByReverseOrder
        }]
    }, {
        divider: true,
    }, {
        disabled: true,
        id: "track-rating",
        content: function() {
            return trackRating.$();
        },
        onClick: function(e) {
            e.preventDefault();
        }
    }]
};

var trackRating = new TrackRating();
var trackContextMenu = new ActionMenu.ContextMenu(playlist.main.$(), trackActionsSpec);
trackContextMenu.on("beforeOpen", function(e) {
    trackRating.update();
    if ($(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
});

playlist.main.on("tracksSelected", function(selectable) {
    var selectedItemsCount = selectable.getSelectedItemViewCount();
    $("#app-selection-count").text(util.shortNumber(selectedItemsCount));

    var actionsToDisable = [];
    var actionsToEnable = [];

    if (selectedItemsCount === 0) {
        actionsToDisable.push("play", "delete", "sort", "track-rating");
    } else if (selectedItemsCount === 1) {
        actionsToEnable.push("play", "delete", "track-rating");
        actionsToDisable.push("sort");
    } else {
        actionsToEnable.push("play", "delete", "sort");
        actionsToDisable.push("track-rating");
    }

    if (selectedItemsCount === 1) {
        trackRating.enable(selectable.first().track());
    } else {
        trackRating.disable();
    }

    if (playlist.main.getSelectedItemViewCount() === 0) {
        actionsToDisable.push("clear-selection");
    } else {
        actionsToEnable.push("clear-selection");
    }

    if (playlist.main.length === playlist.main.getSelectedItemViewCount()) {
        actionsToDisable.push("select-all");
    } else {
        actionsToEnable.push("select-all");
    }

    trackContextMenu.enable(actionsToEnable);
    trackContextMenu.disable(actionsToDisable);
});

playlist.main.on("lengthChange", function(newLength) {
    var haveTracks = newLength > 0;
    var actionsToDisable = [];
    var actionsToEnable = [];

    if (haveTracks) {
        if (newLength === playlist.main.getSelectedItemViewCount()) {
            actionsToDisable.push("select-all");
        } else {
            actionsToEnable.push("select-all");
        }
    } else {
        actionsToDisable.push("select-all", "clear-selection");
    }

    trackContextMenu.enable(actionsToEnable);
    trackContextMenu.disable(actionsToDisable);
});

var playlistModeManager = new PlaylistModeManager(".playlist-controls-container", playlist.main);

playlist.main.on("trackChange", function(track) {
    if (!track) return;
    playlist.trackDisplay.setTrack(track);
});

window.onbeforeunload = function(e) {
    if (!window.DEBUGGING && (playlist.main.length > 0 ||
        ((player.main.isPlaying  || player.main.isPaused) && !player.main.isStopped))) {
        return "Are you sure you want to exit?";
    }
};

player.main = new Player(".app-player-controls", playlist.main, {
    visualizerCanvas: visualizerCanvas,
    playButtonDom: ".play-button",
    pauseButtonDom: ".pause-button",
    previousButtonDom: ".previous-button",
    stopButtonDom: ".stop-button",
    nextButtonDom: ".next-button",
});

var playerTimeManager = new PlayerTimeManager(".player-upper-container", player.main, {
    seekSlider: new Slider(".time-progress-container", {
        updateDom: false
    }),
    currentTimeDom: ".current-time",
    totalTimeDom: ".total-time",
    timeContainerDom: ".playback-status-wrapper",
    timeProgressDom: ".time-progress"
});

var playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", player.main, {
    volumeSlider: new Slider(".volume-slider"),
    muteDom: ".volume-mute"
});

var playerPictureManager = new PlayerPictureManager(".picture-container", player.main, {
    enabledMediaMatcher: visualizerEnabledMediaMatcher
});

var playlistNotifications = new PlaylistNotifications(".notification-setting", player.main);

var visualizerCanvas = new VisualizerCanvas("#visualizer", player.main, {
    binWidth: 3,
    gapWidth: 1,
    capHeight: 1,
    capSeparator: 2,
    capStyle: "rgb(37,117,197)",
    targetFps: 60,
    capDropTime: 750,
    ghostOpacity: 0.14,
    capInterpolator: "ACCELERATE_CUBIC",
    enabledMediaMatcher: visualizerEnabledMediaMatcher,
    binSizeChangeMatcher: matchMedia("(min-width: 320px) or (min-width: 568px) or (min-width: 760px)")
});

player.visualizerCanvas = visualizerCanvas;

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
    document.title = __PROJECT__TITLE;
});

const trackAnalyzer = new TrackAnalyzer(playlist.main);
LocalFiles.setup(features.allowMimes, features.allowExtensions);

function addFilesToPlaylist(files) {
    playlist.main.add(files.map(function(file) {
        return new Track(file);
    }));
}

function filterFiles(files, filter) {
    var ret = new Array(files.length);
    ret.length = 0;
    for (var i = 0; i < files.length; ++i) {
        if (filter(files[i])) {
            ret.push(files[i]);
        }
    }
    return ret;
}


if (features.directories) {
    $('.menul-folder, .add-folder-link').fileInput("create", {
        onchange: function() {
            if ('getFilesAndDirectories' in this) {
                Promise.resolve(this.getFilesAndDirectories()).then(function(filesAndDirs) {
                    var fileEmitter = LocalFiles.fileEmitterFromFilesAndDirs(filesAndDirs, 10000);
                    fileEmitter.on("files", function(files) {
                        addFilesToPlaylist(files);
                    });
                    fileEmitter.on("end", function() {
                        fileEmitter.removeAllListeners();
                    });
                })
            } else {
                addFilesToPlaylist(filterFiles(this.files, LocalFiles.defaultFilter));
            }
            $(".menul-folder").fileInput("clearFiles");
        },
        webkitdirectory: true,
        directory: true
    });
} else {
    $(".menul-folder, .suggestion-folders").remove();
}

$('.menul-files, .add-files-link').fileInput("create", {
    onchange: function() {
        addFilesToPlaylist(filterFiles(this.files, LocalFiles.defaultFilter));
        $(".menul-files").fileInput("clearFiles");
    },
    multiple: true,
    accept: features.allowMimes.join(",")
});

var toolbarSubmenu = new OpenableSubmenu(".toolbar-submenu", ".menul-submenu-open", {
    openerActiveClass: "toolbar-item-active"
});

if (!false && window.DEBUGGING) {
    const FAKE_TRACK_COUNT = 30;
    const id3v1String = function(value) {
        var ret = new Uint8Array(30);
        for (var i = 0; i < value.length; ++i) {
            ret[i] = value.charCodeAt(i);
        }
        return ret;
    };

    var files = new Array(FAKE_TRACK_COUNT);
    var dummy = new Uint8Array(256 * 1024);
    var sync = new Uint8Array(4);
    sync[0] = 0xFF;
    sync[1] = 0xFB;
    sync[2] = 0xB4;
    sync[3] = 0x00;
    for (var i = 0; i < dummy.length; i += 4) {
        dummy[i] = sync[0];
        dummy[i + 1] = sync[1];
        dummy[i + 2] = sync[2];
        dummy[i + 3] = sync[3];
    }
    for (var i = 0; i < files.length; ++i) {
        var tag = new Uint8Array(3);
        tag[0] = 84;
        tag[1] = 65;
        tag[2] = 71;
        var title = id3v1String("Track " + i);
        var artist = id3v1String("Artist");
        var album = id3v1String("Album");
        var year = new Uint8Array(4);
        var comment = id3v1String("Comment");
        var genre = new Uint8Array(1);

        var parts = [sync, dummy, tag, title, artist, album, year, comment, genre];


        files[i] = new File(parts, "file " + i + ".mp3", {type: "audio/mp3"});
    }
    setTimeout(function() {
        addFilesToPlaylist(files);
    }, 10)
}


$(document)
    .on('dragenter', function() {
        return false;
    })
    .on("dragleave", function() {
        return false;
    })
    .on("dragover", function() {
        return false;
    })
    .on("drop", function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var dt = ev.originalEvent.dataTransfer;
        if (!dt) return;
        if (!dt.items && !dt.files) return;

        var files;
        if (dt.getFilesAndDirectories) {
            Promise.resolve(dt.getFilesAndDirectories()).then(function(filesAndDirs) {
                var fileEmitter = LocalFiles.fileEmitterFromFilesAndDirs(filesAndDirs, 10000);
                fileEmitter.on("files", function(files) {
                    addFilesToPlaylist(files);
                });
                fileEmitter.on("end", function() {
                    fileEmitter.removeAllListeners();
                });
            });
        } else if (dt.items && dt.items.length > 0) {
            var item = dt.items[0];
            var entry = item.getAsEntry || item.webkitGetAsEntry;
            if (!entry) {
                files = Promise.resolve(dt.files);
            } else {
                var entries = [].map.call(dt.items, function(v) {
                    return entry.call(v);
                });
                var fileEmitter = LocalFiles.fileEmitterFromEntries(entries, 10000);
                fileEmitter.on("files", function(files) {
                    addFilesToPlaylist(files);
                });
                fileEmitter.on("end", function() {
                    fileEmitter.removeAllListeners();
                });
            }
        } else if (dt.files && dt.files.length > 0) {
            files = Promise.resolve(dt.files);
        }

        if (!files) {
            return;
        }

        files.then(function(files) {
            addFilesToPlaylist(filterFiles(files, LocalFiles.defaultFilter));
        });
    })
    .on("selectstart", function(e) {
        if (!util.isTextInputNode(e.target)) {
            e.preventDefault();
        }
    });



var seekHotkey;
var seekValueToCommit = -1;
var commitSeek = function(e) {
    if (e.key !== seekHotkey) return;
    util.offCapture(document, "keyup", commitSeek);
    player.main.setProgress(seekValueToCommit);
    seekValueToCommit = -1;
};

player.main.on("newTrackLoad", function() {
    util.offCapture(document, "keyup", commitSeek);
});

KeyboardShortcuts.defaultContext.addShortcut("z", player.methodPlay);
KeyboardShortcuts.defaultContext.addShortcut(["x", "MediaStop"], player.methodPause);
KeyboardShortcuts.defaultContext.addShortcut(["mod+ArrowRight", "MediaTrackNext"], player.methodNext);
KeyboardShortcuts.defaultContext.addShortcut(["mod+ArrowLeft", "MediaTrackPrevious"], player.methodPrev);
KeyboardShortcuts.defaultContext.addShortcut("b", function() {
    playlist.main.tryChangeMode("normal");
});
KeyboardShortcuts.defaultContext.addShortcut("n", function() {
    playlist.main.tryChangeMode("shuffle");
});
KeyboardShortcuts.defaultContext.addShortcut("m", function() {
    playlist.main.tryChangeMode("repeat");
});
KeyboardShortcuts.defaultContext.addShortcut("ArrowLeft", function(e) {
    util.offCapture(document, "keyup", commitSeek);

    var p;
    if (seekValueToCommit !== -1) {
        p = seekValueToCommit;
    } else {
        p = player.main.getProgress();
    }

    if (p !== -1) {
        seekValueToCommit = Math.max(Math.min(1, p - 0.01), 0);
        seekHotkey = e.key;
        util.onCapture(document, "keyup", commitSeek);
        player.main.seekIntent(seekValueToCommit);
    }

});
KeyboardShortcuts.defaultContext.addShortcut("ArrowRight", function(e) {
    util.offCapture(document, "keyup", commitSeek);

    var p;
    if (seekValueToCommit !== -1) {
        p = seekValueToCommit;
    } else {
        p = player.main.getProgress();
    }

    if (p !== -1) {
        seekValueToCommit = Math.max(Math.min(1, p + 0.01), 0);
        seekHotkey = e.key;
        util.onCapture(document, "keyup", commitSeek);
        player.main.seekIntent(seekValueToCommit);
    }
});

KeyboardShortcuts.defaultContext.addShortcut(["-", "VolumeDown"], function() {
    player.main.setVolume(player.main.getVolume() - 0.01);
});
KeyboardShortcuts.defaultContext.addShortcut(["+", "VolumeUp"], function() {
    player.main.setVolume(player.main.getVolume() + 0.01);
});
KeyboardShortcuts.defaultContext.addShortcut([" ", "MediaPlayPause"], function() {
    player.main.togglePlayback();
});
KeyboardShortcuts.defaultContext.addShortcut(["VolumeMute", "alt+mod+m"], function() {
    player.main.toggleMute();
});
KeyboardShortcuts.defaultContext.addShortcut("alt+t", function() {
    playerTimeManager.toggleDisplayMode();
});

if (touch) {
    const toggleGesture = domUtil.twoFingerTapHandler(function() {
        var gesture = player.main.isPlaying ? "pause" : "play";
        gestureScreenFlasher.flashGesture(gesture);
        player.main.togglePlayback();
    }, 1);
    const nextTrackGesture = domUtil.horizontalTwoFingerSwipeHandler(function() {
        gestureScreenFlasher.flashGesture("next");
        player.methodNext()
    }, 1);
    const previousTrackGesture = domUtil.horizontalTwoFingerSwipeHandler(function() {
        gestureScreenFlasher.flashGesture("previous");
        player.methodPrev();
    }, -1);

    const enableGestures = function() {
        util.onCapture(document, domUtil.TOUCH_EVENTS, toggleGesture);
        util.onCapture(document, domUtil.TOUCH_EVENTS, nextTrackGesture);
        util.onCapture(document, domUtil.TOUCH_EVENTS, previousTrackGesture);
    };

    const disableGestures = function() {
        util.offCapture(document, domUtil.TOUCH_EVENTS, toggleGesture);
        util.offCapture(document, domUtil.TOUCH_EVENTS, nextTrackGesture);
        util.offCapture(document, domUtil.TOUCH_EVENTS, previousTrackGesture);
    };

    enableGestures();
    KeyboardShortcuts.on("disable", disableGestures);
    KeyboardShortcuts.on("enable", enableGestures);

    util.onCapture(document, domUtil.TOUCH_EVENTS, domUtil.tapHandler(function(e) {
        GlobalUi.rippler.rippleAt(e.clientX, e.clientY, 35, "#aaaaaa");
    }));
}

const rinput = /^(input|select|textarea|button)$/i;
util.onCapture(document, "keydown", function(e) {
    var key = e.key;
    if (key === "Escape") {
        $(window).trigger("clear");
    }

    if (e.target === document.activeElement &&
        e.target.tabIndex >= 0 &&
        !rinput.test(e.target.nodeName)) {


        if (key === "Spacebar" || key === "Enter") {
            var box = e.target.getBoundingClientRect();
            var x = (((box.left + box.right) / 2) | 0) - window.scrollX;
            var y = (((box.top + box.bottom) / 2) | 0) - window.scrollY;
            var ev = new MouseEvent("click", {
                view: window,
                bubbles: true,
                cancelable: true,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                button: -1,
                buttons: 0,
                screenX: x,
                clientX: x,
                screenY: y,
                clientY: y
            });
            e.target.dispatchEvent(ev);
        } else if (key === "Escape") {
            e.target.blur();
        }
    }

});

(function() {
    // Android keyboard fix.
    var fireSizeChangeEvents = true;
    var pendingSizeChange = false;

    const triggerSizeChange = function() {
        if (!fireSizeChangeEvents) {
            return;
        }

        var activeElement = document.activeElement;
        if (activeElement && domUtil.isTextInputElement(activeElement)) {
            pendingSizeChange = true;
            return;
        }

        var event = new Event("sizechange", {
            bubbles: true,
            cancelable: false
        });
        window.dispatchEvent(event);
    };

    const resetFireSizeChangeEvents = util.throttle(function() {
        fireSizeChangeEvents = true;
    }, 500);

    const firePendingSizeChangeEvent = util.throttle(triggerSizeChange, 100);


    util.onCapture(document, "focus", function(e) {
        if (domUtil.isTextInputElement(e.target)) {
            fireSizeChangeEvents = false;
            resetFireSizeChangeEvents();
        }
    });

    util.onCapture(document, "blur", function(e) {
        if (domUtil.isTextInputElement(e.target)) {
            window.scrollTo(0, 0);
            if (pendingSizeChange) {
                pendingSizeChange = false;
                firePendingSizeChangeEvent();
            }
        }
    });

    requestAnimationFrame(triggerSizeChange);
    util.onCapture(window, "resize", triggerSizeChange);
})();
}).catch(function(e) {
    console.log(e && (e.stack || e.message));
});
