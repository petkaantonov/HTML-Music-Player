/*
 * jQuery Hotkeys Plugin
 * Copyright 2010, John Resig
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Based upon the plugin by Tzury Bar Yochay:
 * https://github.com/tzuryby/jquery.hotkeys
 *
 * Original idea by:
 * Binny V A, http://www.openjs.com/scripts/events/keyboard_shortcuts/
 */

var keys = {
    8: "backspace",
    9: "tab",
    10: "keypad enter",
    13: "enter",
    16: "shift",
    17: "ctrl",
    18: "alt",
    19: "pause",
    20: "capslock",
    27: "esc",
    32: "space",
    33: "pageup",
    34: "pagedown",
    35: "end",
    36: "home",
    37: "left arrow",
    38: "up arrow",
    39: "right arrow",
    40: "down arrow",
    45: "insert",
    46: "del",
    59: ";",
    61: "=",
    96: "0",
    97: "1",
    98: "2",
    99: "3",
    100: "4",
    101: "5",
    102: "6",
    103: "7",
    104: "8",
    105: "9",
    106: "*",
    107: "+",
    109: "-",
    110: ".",
    111: "/",
    112: "f1",
    113: "f2",
    114: "f3",
    115: "f4",
    116: "f5",
    117: "f6",
    118: "f7",
    119: "f8",
    120: "f9",
    121: "f10",
    122: "f11",
    123: "f12",
    144: "numlock",
    145: "scroll",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'"
};

var shiftKeys = {
    "`": "~",
    "1": "!",
    "2": "@",
    "3": "#",
    "4": "$",
    "5": "%",
    "6": "^",
    "7": "&",
    "8": "*",
    "9": "(",
    "0": ")",
    "-": "_",
    "=": "+",
    ";": ": ",
    "'": "\"",
    ",": "<",
    ".": ">",
    "/": "?",
    "\\": "|"
};

var map = Object.create(null);
var inputPattern = /textarea|input|select/i;

var ret = {
    keys: keys,

    shiftKeys: shiftKeys,

    add: function(keyCombination, handler, options) {
        if (!keyCombination) return;
        options = Object(options);
        keyCombination = keyCombination.toLowerCase();
        var split = keyCombination.split(",");

        if (split.length > 1) {
            return split.forEach(function(keyCombination) {
                ret.add(keyCombination, handler, options);
            });
        }


        if (map[keyCombination] && map[keyCombination].length && !options.allowMultiple) {
            throw new Error(keyCombination + " has already been bound");
        }

        var current = map[keyCombination];

        if (!current) {
            current = map[keyCombination] = [];
        }

        current.push({
            keyHandler: keyHandler,
            userHandler: handler
        });


        function keyHandler(e) {
            var insideInput = !!(inputPattern.test(e.target.nodeName) || e.target.isContentEditable);

            if (insideInput && !options.allowInput) {
                return;
            }


            var special = keys[e.which];
            var character = String.fromCharCode(e.which).toLowerCase();
            var modifier = "";
            if (e.altKey && special !== "alt") modifier += "alt+";
            if (e.shiftKey && special !== "shift") modifier += "shift+";
            if (e.ctrlKey && special !== "ctrl") modifier += "ctrl+";
            if (e.metaKey && special !== "meta" && !e.ctrlKey) modifier += "meta+";

            if (special && modifier + special === keyCombination) {
                e.preventDefault();
                return handler(e);
            } else if (modifier + character === keyCombination) {
                e.preventDefault();
                return handler(e);
            } else if (modifier + shiftKeys[character] === keyCombination) {
                e.preventDefault();
                return handler(e);
            } else if (modifier === "shift+" && shiftKeys[character] === keyCombination) {
                e.preventDefault();
                return handler(e);
            }
        }

        $(document).on("keydown", keyHandler);
    },

    remove: function(keyCombination, handler) {

        if (!keyCombination) return;
        keyCombination = keyCombination.toLowerCase();
        var split = keyCombination.split(",");

        if (split.length > 1) {
            return split.forEach(function(keyCombination) {
                ret.remove(keyCombination, handler);
            });
        }

        var handlerArray = map[keyCombination];

        if (!handlerArray) return;

        if (!handler) {
            handlerArray.forEach(function(item) {
                $(document).off("keydown", item.keyHandler);
            });
            delete map[keyCombination];
        } else {
            var index = -1;
            handlerArray.forEach(function(item, i) {
                if (index === -1 && item.userHandler === handler) {
                    index = i;
                    $(document).off("keydown", item.keyHandler);
                }
            });

            if (index >= 0) {
                handlerArray.splice(index, 1);
            }
        }
    }
};

module.exports = ret;
