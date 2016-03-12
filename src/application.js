"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";

import { isTextInputNode, offCapture, onCapture, throttle } from "lib/util";
import serviceWorkerManager from "ServiceWorkerManager";
import TrackDisplay from "ui/TrackDisplay";
import Player from "Player";
import Playlist from "Playlist";
import PlaylistModeManager from "ui/PlaylistModeManager";
import Slider from "ui/Slider";

import VisualizerCanvas from "ui/VisualizerCanvas";
import TrackAnalyzer from "audio/TrackAnalyzer";
import LocalFiles from "LocalFiles";
import { rippler, spinner } from "ui/GlobalUi";
import { touch as touch } from "features";
import { TOUCH_EVENTS, horizontalTwoFingerSwipeHandler, isTextInputElement, tapHandler, twoFingerTapHandler } from "lib/DomUtil";
import gestureScreenFlasher from "ui/GestureScreenFlasher";
import TrackRating from "TrackRating";
import Track from "Track";
import OpenableSubmenu from "ui/OpenableSubmenu";
import KeyboardShortcuts from "ui/KeyboardShortcuts";
import { initialize as initializeMainTabs, playlist, search, queue, tabs } from "main_tabs";
import { allowExtensions, allowMimes, directories, requiredFeatures } from "features";
import KeyValueDatabase from "KeyValueDatabase";


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

const trackAnalyzer = new TrackAnalyzer(playlist.main);
mainTabs.search.setTrackAnalyzer(trackAnalyzer);
LocalFiles.setup(allowMimes, allowExtensions);

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


if (directories) {
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
    accept: allowMimes.join(",")
});

var toolbarSubmenu = new OpenableSubmenu(".toolbar-submenu", ".menul-submenu-open", {
    openerActiveClass: "toolbar-item-active"
});

if (false && window.DEBUGGING) {
    const FAKE_TRACK_COUNT = 8;
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
        if (!isTextInputNode(e.target)) {
            e.preventDefault();
        }
    });



var seekHotkey;
var seekValueToCommit = -1;
var commitSeek = function(e) {
    if (e.key !== seekHotkey) return;
    offCapture(document, "keyup", commitSeek);
    player.main.setProgress(seekValueToCommit);
    seekValueToCommit = -1;
};

player.main.on("newTrackLoad", function() {
    offCapture(document, "keyup", commitSeek);
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
    offCapture(document, "keyup", commitSeek);

    var p;
    if (seekValueToCommit !== -1) {
        p = seekValueToCommit;
    } else {
        p = player.main.getProgress();
    }

    if (p !== -1) {
        seekValueToCommit = Math.max(Math.min(1, p - 0.01), 0);
        seekHotkey = e.key;
        onCapture(document, "keyup", commitSeek);
        player.main.seekIntent(seekValueToCommit);
    }

});
KeyboardShortcuts.defaultContext.addShortcut("ArrowRight", function(e) {
    offCapture(document, "keyup", commitSeek);

    var p;
    if (seekValueToCommit !== -1) {
        p = seekValueToCommit;
    } else {
        p = player.main.getProgress();
    }

    if (p !== -1) {
        seekValueToCommit = Math.max(Math.min(1, p + 0.01), 0);
        seekHotkey = e.key;
        onCapture(document, "keyup", commitSeek);
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
    const toggleGesture = twoFingerTapHandler(function() {
        var gesture = player.main.isPlaying ? "pause" : "play";
        gestureScreenFlasher.flashGesture(gesture);
        player.main.togglePlayback();
    }, 1);
    const nextTrackGesture = horizontalTwoFingerSwipeHandler(function() {
        gestureScreenFlasher.flashGesture("next");
        player.methodNext()
    }, 1);
    const previousTrackGesture = horizontalTwoFingerSwipeHandler(function() {
        gestureScreenFlasher.flashGesture("previous");
        player.methodPrev();
    }, -1);

    const enableGestures = function() {
        onCapture(document, TOUCH_EVENTS, toggleGesture);
        onCapture(document, TOUCH_EVENTS, nextTrackGesture);
        onCapture(document, TOUCH_EVENTS, previousTrackGesture);
    };

    const disableGestures = function() {
        offCapture(document, TOUCH_EVENTS, toggleGesture);
        offCapture(document, TOUCH_EVENTS, nextTrackGesture);
        offCapture(document, TOUCH_EVENTS, previousTrackGesture);
    };

    enableGestures();
    KeyboardShortcuts.on("disable", disableGestures);
    KeyboardShortcuts.on("enable", enableGestures);

    onCapture(document, TOUCH_EVENTS, tapHandler(function(e) {
        rippler.rippleAt(e.clientX, e.clientY, 35, "#aaaaaa");
    }));
}

const rinput = /^(input|select|textarea|button)$/i;
onCapture(document, "keydown", function(e) {
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
        if (activeElement && isTextInputElement(activeElement)) {
            pendingSizeChange = true;
            return;
        }

        var event = new Event("sizechange", {
            bubbles: true,
            cancelable: false
        });
        window.dispatchEvent(event);
    };

    const resetFireSizeChangeEvents = throttle(function() {
        fireSizeChangeEvents = true;
    }, 500);

    const firePendingSizeChangeEvent = throttle(triggerSizeChange, 100);


    onCapture(document, "focus", function(e) {
        if (isTextInputElement(e.target)) {
            fireSizeChangeEvents = false;
            resetFireSizeChangeEvents();
        }
    });

    onCapture(document, "blur", function(e) {
        if (isTextInputElement(e.target)) {
            window.scrollTo(0, 0);
            if (pendingSizeChange) {
                pendingSizeChange = false;
                firePendingSizeChangeEvent();
            }
        }
    });

    requestAnimationFrame(triggerSizeChange);
    onCapture(window, "resize", triggerSizeChange);
})();
}).catch(function(e) {
    console.log(e && (e.stack || e.message));
});
