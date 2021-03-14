/* eslint-disable */
var v;

(function (global) {
    var nativeKeyboardEvent = "KeyboardEvent" in global;
    if (!nativeKeyboardEvent)
        global.KeyboardEvent = function KeyboardEvent() {
            throw TypeError("Illegal constructor");
        };

    try {
        global.KeyboardEvent.DOM_KEY_LOCATION_STANDARD = 0x00;
    } catch (e) {} // Default or unknown location
    try {
        global.KeyboardEvent.DOM_KEY_LOCATION_LEFT = 0x01;
    } catch (e) {} // e.g. Left Alt key
    try {
        global.KeyboardEvent.DOM_KEY_LOCATION_RIGHT = 0x02;
    } catch (e) {} // e.g. Right Alt key
    try {
        global.KeyboardEvent.DOM_KEY_LOCATION_NUMPAD = 0x03;
    } catch (e) {} // e.g. Numpad 0 or +

    var STANDARD = window.KeyboardEvent.DOM_KEY_LOCATION_STANDARD,
        LEFT = window.KeyboardEvent.DOM_KEY_LOCATION_LEFT,
        RIGHT = window.KeyboardEvent.DOM_KEY_LOCATION_RIGHT,
        NUMPAD = window.KeyboardEvent.DOM_KEY_LOCATION_NUMPAD;

    //--------------------------------------------------------------------
    //
    // Utilities
    //
    //--------------------------------------------------------------------

    function contains(s, ss) {
        return String(s).indexOf(ss) !== -1;
    }

    var os = (function () {
        if (contains(navigator.platform, "Win")) {
            return "win";
        }
        if (contains(navigator.platform, "Mac")) {
            return "mac";
        }
        if (contains(navigator.platform, "CrOS")) {
            return "cros";
        }
        if (contains(navigator.platform, "Linux")) {
            return "linux";
        }
        if (
            contains(navigator.userAgent, "iPad") ||
            contains(navigator.platform, "iPod") ||
            contains(navigator.platform, "iPhone")
        ) {
            return "ios";
        }
        return "";
    })();

    var browser = (function () {
        if (contains(navigator.userAgent, "Chrome/")) {
            return "chrome";
        }
        if (contains(navigator.vendor, "Apple")) {
            return "safari";
        }
        if (contains(navigator.userAgent, "MSIE")) {
            return "ie";
        }
        if (contains(navigator.userAgent, "Gecko/")) {
            return "moz";
        }
        if (contains(navigator.userAgent, "Opera/")) {
            return "opera";
        }
        return "";
    })();

    var browser_os = browser + "-" + os;

    function mergeIf(baseTable, select, table) {
        if (browser_os === select || browser === select || os === select) {
            Object.keys(table).forEach(function (keyCode) {
                baseTable[keyCode] = table[keyCode];
            });
        }
    }

    function remap(o, key) {
        var r = {};
        Object.keys(o).forEach(function (k) {
            var item = o[k];
            if (key in item) {
                r[item[key]] = item;
            }
        });
        return r;
    }

    function invert(o) {
        var r = {};
        Object.keys(o).forEach(function (k) {
            r[o[k]] = k;
        });
        return r;
    }

    //--------------------------------------------------------------------
    //
    // Generic Mappings
    //
    //--------------------------------------------------------------------

    // "keyInfo" is a dictionary:
    //   code: string - name from DOM Level 3 KeyboardEvent code Values
    //     https://dvcs.w3.org/hg/dom3events/raw-file/tip/html/DOM3Events-code.html
    //   location (optional): number - one of the DOM_KEY_LOCATION values
    //   keyCap (optional): string - keyboard label in en-US locale
    // USB code Usage ID from page 0x07 unless otherwise noted (Informative)

    // Map of keyCode to keyInfo
    var keyCodeToInfoTable = {
        // 0x01 - VK_LBUTTON
        // 0x02 - VK_RBUTTON
        0x03: { code: "Cancel" }, // [USB: 0x9b] char \x0018 ??? (Not in D3E)
        // 0x04 - VK_MBUTTON
        // 0x05 - VK_XBUTTON1
        // 0x06 - VK_XBUTTON2
        0x06: { code: "Help" }, // [USB: 0x75] ???
        // 0x07 - undefined
        0x08: { code: "Backspace" }, // [USB: 0x2a] Labelled Delete on Macintosh keyboards.
        0x09: { code: "Tab" }, // [USB: 0x2b]
        // 0x0A-0x0B - reserved
        0x0c: { code: "Clear" }, // [USB: 0x9c] NumPad Center (Not in D3E)
        0x0d: { code: "Enter" }, // [USB: 0x28]
        // 0x0E-0x0F - undefined

        0x10: { code: "Shift" },
        0x11: { code: "Control" },
        0x12: { code: "Alt" },
        0x13: { code: "Pause" }, // [USB: 0x48]
        0x14: { code: "CapsLock" }, // [USB: 0x39]
        0x15: { code: "KanaMode" }, // [USB: 0x88] - "HangulMode" for Korean layout
        0x16: { code: "HangulMode" }, // [USB: 0x90] 0x15 as well in MSDN VK table ???
        0x17: { code: "JunjaMode" }, // (Not in D3E)
        0x18: { code: "FinalMode" }, // (Not in D3E)
        0x19: { code: "KanjiMode" }, // [USB: 0x91] - "HanjaMode" for Korean layout
        // 0x1A - undefined
        0x1b: { code: "Escape" }, // [USB: 0x29]
        0x1c: { code: "Convert" }, // [USB: 0x8a]
        0x1d: { code: "NonConvert" }, // [USB: 0x8b]
        0x1e: { code: "Accept" }, // (Not in D3E)
        0x1f: { code: "ModeChange" }, // (Not in D3E)

        0x20: { code: "Space" }, // [USB: 0x2c]
        0x21: { code: "PageUp" }, // [USB: 0x4b]
        0x22: { code: "PageDown" }, // [USB: 0x4e]
        0x23: { code: "End" }, // [USB: 0x4d]
        0x24: { code: "Home" }, // [USB: 0x4a]
        0x25: { code: "ArrowLeft" }, // [USB: 0x50]
        0x26: { code: "ArrowUp" }, // [USB: 0x52]
        0x27: { code: "ArrowRight" }, // [USB: 0x4f]
        0x28: { code: "ArrowDown" }, // [USB: 0x51]
        0x29: { code: "Select" }, // (Not in D3E)
        0x2a: { code: "Print" }, // (Not in D3E)
        0x2b: { code: "Execute" }, // [USB: 0x74] (Not in D3E)
        0x2c: { code: "PrintScreen" }, // [USB: 0x46]
        0x2d: { code: "Insert" }, // [USB: 0x49]
        0x2e: { code: "Delete" }, // [USB: 0x4c]
        0x2f: { code: "Help" }, // [USB: 0x75] ???

        0x30: { code: "Digit0", keyCap: "0" }, // [USB: 0x27] 0)
        0x31: { code: "Digit1", keyCap: "1" }, // [USB: 0x1e] 1!
        0x32: { code: "Digit2", keyCap: "2" }, // [USB: 0x1f] 2@
        0x33: { code: "Digit3", keyCap: "3" }, // [USB: 0x20] 3#
        0x34: { code: "Digit4", keyCap: "4" }, // [USB: 0x21] 4$
        0x35: { code: "Digit5", keyCap: "5" }, // [USB: 0x22] 5%
        0x36: { code: "Digit6", keyCap: "6" }, // [USB: 0x23] 6^
        0x37: { code: "Digit7", keyCap: "7" }, // [USB: 0x24] 7&
        0x38: { code: "Digit8", keyCap: "8" }, // [USB: 0x25] 8*
        0x39: { code: "Digit9", keyCap: "9" }, // [USB: 0x26] 9(
        // 0x3A-0x40 - undefined

        0x41: { code: "KeyA", keyCap: "a" }, // [USB: 0x04]
        0x42: { code: "KeyB", keyCap: "b" }, // [USB: 0x05]
        0x43: { code: "KeyC", keyCap: "c" }, // [USB: 0x06]
        0x44: { code: "KeyD", keyCap: "d" }, // [USB: 0x07]
        0x45: { code: "KeyE", keyCap: "e" }, // [USB: 0x08]
        0x46: { code: "KeyF", keyCap: "f" }, // [USB: 0x09]
        0x47: { code: "KeyG", keyCap: "g" }, // [USB: 0x0a]
        0x48: { code: "KeyH", keyCap: "h" }, // [USB: 0x0b]
        0x49: { code: "KeyI", keyCap: "i" }, // [USB: 0x0c]
        0x4a: { code: "KeyJ", keyCap: "j" }, // [USB: 0x0d]
        0x4b: { code: "KeyK", keyCap: "k" }, // [USB: 0x0e]
        0x4c: { code: "KeyL", keyCap: "l" }, // [USB: 0x0f]
        0x4d: { code: "KeyM", keyCap: "m" }, // [USB: 0x10]
        0x4e: { code: "KeyN", keyCap: "n" }, // [USB: 0x11]
        0x4f: { code: "KeyO", keyCap: "o" }, // [USB: 0x12]

        0x50: { code: "KeyP", keyCap: "p" }, // [USB: 0x13]
        0x51: { code: "KeyQ", keyCap: "q" }, // [USB: 0x14]
        0x52: { code: "KeyR", keyCap: "r" }, // [USB: 0x15]
        0x53: { code: "KeyS", keyCap: "s" }, // [USB: 0x16]
        0x54: { code: "KeyT", keyCap: "t" }, // [USB: 0x17]
        0x55: { code: "KeyU", keyCap: "u" }, // [USB: 0x18]
        0x56: { code: "KeyV", keyCap: "v" }, // [USB: 0x19]
        0x57: { code: "KeyW", keyCap: "w" }, // [USB: 0x1a]
        0x58: { code: "KeyX", keyCap: "x" }, // [USB: 0x1b]
        0x59: { code: "KeyY", keyCap: "y" }, // [USB: 0x1c]
        0x5a: { code: "KeyZ", keyCap: "z" }, // [USB: 0x1d]
        0x5b: { code: "OSLeft", location: LEFT }, // [USB: 0xe3]
        0x5c: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
        0x5d: { code: "ContextMenu" }, // [USB: 0x65] Context Menu
        // 0x5E - reserved
        0x5f: { code: "Standby" }, // [USB: 0x82] Sleep

        0x60: { code: "Numpad0", keyCap: "0", location: NUMPAD }, // [USB: 0x62]
        0x61: { code: "Numpad1", keyCap: "1", location: NUMPAD }, // [USB: 0x59]
        0x62: { code: "Numpad2", keyCap: "2", location: NUMPAD }, // [USB: 0x5a]
        0x63: { code: "Numpad3", keyCap: "3", location: NUMPAD }, // [USB: 0x5b]
        0x64: { code: "Numpad4", keyCap: "4", location: NUMPAD }, // [USB: 0x5c]
        0x65: { code: "Numpad5", keyCap: "5", location: NUMPAD }, // [USB: 0x5d]
        0x66: { code: "Numpad6", keyCap: "6", location: NUMPAD }, // [USB: 0x5e]
        0x67: { code: "Numpad7", keyCap: "7", location: NUMPAD }, // [USB: 0x5f]
        0x68: { code: "Numpad8", keyCap: "8", location: NUMPAD }, // [USB: 0x60]
        0x69: { code: "Numpad9", keyCap: "9", location: NUMPAD }, // [USB: 0x61]
        0x6a: { code: "NumpadMultiply", keyCap: "*", location: NUMPAD }, // [USB: 0x55]
        0x6b: { code: "NumpadAdd", keyCap: "+", location: NUMPAD }, // [USB: 0x57]
        0x6c: { code: "NumpadComma", keyCap: ",", location: NUMPAD }, // [USB: 0x85]
        0x6d: { code: "NumpadSubtract", keyCap: "-", location: NUMPAD }, // [USB: 0x56]
        0x6e: { code: "NumpadDecimal", keyCap: ".", location: NUMPAD }, // [USB: 0x63]
        0x6f: { code: "NumpadDivide", keyCap: "/", location: NUMPAD }, // [USB: 0x54]

        0x70: { code: "F1" }, // [USB: 0x3a]
        0x71: { code: "F2" }, // [USB: 0x3b]
        0x72: { code: "F3" }, // [USB: 0x3c]
        0x73: { code: "F4" }, // [USB: 0x3d]
        0x74: { code: "F5" }, // [USB: 0x3e]
        0x75: { code: "F6" }, // [USB: 0x3f]
        0x76: { code: "F7" }, // [USB: 0x40]
        0x77: { code: "F8" }, // [USB: 0x41]
        0x78: { code: "F9" }, // [USB: 0x42]
        0x79: { code: "F10" }, // [USB: 0x43]
        0x7a: { code: "F11" }, // [USB: 0x44]
        0x7b: { code: "F12" }, // [USB: 0x45]
        0x7c: { code: "F13" }, // [USB: 0x68]
        0x7d: { code: "F14" }, // [USB: 0x69]
        0x7e: { code: "F15" }, // [USB: 0x6a]
        0x7f: { code: "F16" }, // [USB: 0x6b]

        0x80: { code: "F17" }, // [USB: 0x6c]
        0x81: { code: "F18" }, // [USB: 0x6d]
        0x82: { code: "F19" }, // [USB: 0x6e]
        0x83: { code: "F20" }, // [USB: 0x6f]
        0x84: { code: "F21" }, // [USB: 0x70]
        0x85: { code: "F22" }, // [USB: 0x71]
        0x86: { code: "F23" }, // [USB: 0x72]
        0x87: { code: "F24" }, // [USB: 0x73]
        // 0x88-0x8F - unassigned

        0x90: { code: "NumLock", location: NUMPAD }, // [USB: 0x53]
        0x91: { code: "ScrollLock" }, // [USB: 0x47]
        // 0x92-0x96 - OEM specific
        // 0x97-0x9F - unassigned

        // NOTE: 0xA0-0xA5 usually mapped to 0x10-0x12 in browsers
        0xa0: { code: "ShiftLeft", location: LEFT }, // [USB: 0xe1]
        0xa1: { code: "ShiftRight", location: RIGHT }, // [USB: 0xe5]
        0xa2: { code: "ControlLeft", location: LEFT }, // [USB: 0xe0]
        0xa3: { code: "ControlRight", location: RIGHT }, // [USB: 0xe4]
        0xa4: { code: "AltLeft", location: LEFT }, // [USB: 0xe2]
        0xa5: { code: "AltRight", location: RIGHT }, // [USB: 0xe6]

        0xa6: { code: "BrowserBack" }, // [USB: 0x0c/0x0224]
        0xa7: { code: "BrowserForward" }, // [USB: 0x0c/0x0225]
        0xa8: { code: "BrowserRefresh" }, // [USB: 0x0c/0x0227]
        0xa9: { code: "BrowserStop" }, // [USB: 0x0c/0x0226]
        0xaa: { code: "BrowserSearch" }, // [USB: 0x0c/0x0221]
        0xab: { code: "BrowserFavorites" }, // [USB: 0x0c/0x0228]
        0xac: { code: "BrowserHome" }, // [USB: 0x0c/0x0222]
        0xad: { code: "VolumeMute" }, // [USB: 0x7f]
        0xae: { code: "VolumeDown" }, // [USB: 0x81]
        0xaf: { code: "VolumeUp" }, // [USB: 0x80]

        0xb0: { code: "MediaTrackNext" }, // [USB: 0x0c/0x00b5]
        0xb1: { code: "MediaTrackPrevious" }, // [USB: 0x0c/0x00b6]
        0xb2: { code: "MediaStop" }, // [USB: 0x0c/0x00b7]
        0xb3: { code: "MediaPlayPause" }, // [USB: 0x0c/0x00cd]
        0xb4: { code: "LaunchMail" }, // [USB: 0x0c/0x018a]
        0xb5: { code: "MediaSelect" },
        0xb6: { code: "LaunchApp1" },
        0xb7: { code: "LaunchApp2" },
        // 0xB8-0xB9 - reserved
        0xba: { code: "Semicolon", keyCap: ";" }, // [USB: 0x33] ;: (US Standard 101)
        0xbb: { code: "Equal", keyCap: "=" }, // [USB: 0x2e] =+
        0xbc: { code: "Comma", keyCap: "," }, // [USB: 0x36] ,<
        0xbd: { code: "Minus", keyCap: "-" }, // [USB: 0x2d] -_
        0xbe: { code: "Period", keyCap: "." }, // [USB: 0x37] .>
        0xbf: { code: "Slash", keyCap: "/" }, // [USB: 0x38] /? (US Standard 101)

        0xc0: { code: "Backquote", keyCap: "`" }, // [USB: 0x35] `~ (US Standard 101)
        // 0xC1-0xCF - reserved

        // 0xD0-0xD7 - reserved
        // 0xD8-0xDA - unassigned
        0xdb: { code: "BracketLeft", keyCap: "[" }, // [USB: 0x2f] [{ (US Standard 101)
        0xdc: { code: "Backslash", keyCap: "\\" }, // [USB: 0x31] \| (US Standard 101)
        0xdd: { code: "BracketRight", keyCap: "]" }, // [USB: 0x30] ]} (US Standard 101)
        0xde: { code: "Quote", keyCap: "'" }, // [USB: 0x34] '" (US Standard 101)
        // 0xDF - miscellaneous/varies

        // 0xE0 - reserved
        // 0xE1 - OEM specific
        0xe2: { code: "IntlBackslash", keyCap: "\\" }, // [USB: 0x64] \| (UK Standard 102)
        // 0xE3-0xE4 - OEM specific
        0xe5: { code: "Process" }, // (Not in D3E)
        // 0xE6 - OEM specific
        // 0xE7 - VK_PACKET
        // 0xE8 - unassigned
        // 0xE9-0xEF - OEM specific

        // 0xF0-0xF5 - OEM specific
        0xf6: { code: "Attn" }, // [USB: 0x9a] (Not in D3E)
        0xf7: { code: "CrSel" }, // [USB: 0xa3] (Not in D3E)
        0xf8: { code: "ExSel" }, // [USB: 0xa4] (Not in D3E)
        0xf9: { code: "EraseEof" }, // (Not in D3E)
        0xfa: { code: "Play" }, // (Not in D3E)
        0xfb: { code: "ZoomToggle" }, // (Not in D3E)
        // 0xFC - VK_NONAME - reserved
        // 0xFD - VK_PA1
        0xfe: { code: "Clear" }, // [USB: 0x9c] (Not in D3E)
    };

    // No legacy keyCode, but listed in D3E:

    // code: usb
    // 'IntlHash': 0x070032,
    // 'IntlRo': 0x070087,
    // 'IntlYen': 0x070089,
    // 'NumpadBackspace': 0x0700bb,
    // 'NumpadClear': 0x0700d8,
    // 'NumpadClearEntry': 0x0700d9,
    // 'NumpadMemoryAdd': 0x0700d3,
    // 'NumpadMemoryClear': 0x0700d2,
    // 'NumpadMemoryRecall': 0x0700d1,
    // 'NumpadMemoryStore': 0x0700d0,
    // 'NumpadMemorySubtract': 0x0700d4,
    // 'NumpadParenLeft': 0x0700b6,
    // 'NumpadParenRight': 0x0700b7,

    //--------------------------------------------------------------------
    //
    // Browser/OS Specific Mappings
    //
    //--------------------------------------------------------------------

    mergeIf(keyCodeToInfoTable, "moz", {
        0x3b: { code: "Semicolon", keyCap: ";" }, // [USB: 0x33] ;: (US Standard 101)
        0x3d: { code: "Equal", keyCap: "=" }, // [USB: 0x2e] =+
        0x6b: { code: "Equal", keyCap: "=" }, // [USB: 0x2e] =+
        0x6d: { code: "Minus", keyCap: "-" }, // [USB: 0x2d] -_
        0xbb: { code: "NumpadAdd", keyCap: "+", location: NUMPAD }, // [USB: 0x57]
        0xbd: { code: "NumpadSubtract", keyCap: "-", location: NUMPAD }, // [USB: 0x56]
    });

    mergeIf(keyCodeToInfoTable, "moz-mac", {
        0x0c: { code: "NumLock", location: NUMPAD }, // [USB: 0x53]
        0xad: { code: "Minus", keyCap: "-" }, // [USB: 0x2d] -_
    });

    mergeIf(keyCodeToInfoTable, "moz-win", {
        0xad: { code: "Minus", keyCap: "-" }, // [USB: 0x2d] -_
    });

    mergeIf(keyCodeToInfoTable, "chrome-mac", {
        0x5d: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
    });

    // Windows via Bootcamp (!)
    if (0) {
        mergeIf(keyCodeToInfoTable, "chrome-win", {
            0xc0: { code: "Quote", keyCap: "'" }, // [USB: 0x34] '" (US Standard 101)
            0xde: { code: "Backslash", keyCap: "\\" }, // [USB: 0x31] \| (US Standard 101)
            0xdf: { code: "Backquote", keyCap: "`" }, // [USB: 0x35] `~ (US Standard 101)
        });

        mergeIf(keyCodeToInfoTable, "ie", {
            0xc0: { code: "Quote", keyCap: "'" }, // [USB: 0x34] '" (US Standard 101)
            0xde: { code: "Backslash", keyCap: "\\" }, // [USB: 0x31] \| (US Standard 101)
            0xdf: { code: "Backquote", keyCap: "`" }, // [USB: 0x35] `~ (US Standard 101)
        });
    }

    mergeIf(keyCodeToInfoTable, "safari", {
        0x03: { code: "Enter" }, // [USB: 0x28] old Safari
        0x19: { code: "Tab" }, // [USB: 0x2b] old Safari for Shift+Tab
    });

    mergeIf(keyCodeToInfoTable, "ios", {
        0x0a: { code: "Enter", location: STANDARD }, // [USB: 0x28]
    });

    mergeIf(keyCodeToInfoTable, "safari-mac", {
        0x5b: { code: "OSLeft", location: LEFT }, // [USB: 0xe3]
        0x5d: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
        0xe5: { code: "KeyQ", keyCap: "Q" }, // [USB: 0x14] On alternate presses, Ctrl+Q sends this
    });

    //--------------------------------------------------------------------
    //
    // Identifier Mappings
    //
    //--------------------------------------------------------------------

    // Cases where newer-ish browsers send keyIdentifier which can be
    // used to disambiguate keys.

    // keyIdentifierTable[keyIdentifier] -> keyInfo

    var keyIdentifierTable = {};
    if ("cros" === os) {
        keyIdentifierTable["U+00A0"] = { code: "ShiftLeft", location: LEFT };
        keyIdentifierTable["U+00A1"] = { code: "ShiftRight", location: RIGHT };
        keyIdentifierTable["U+00A2"] = { code: "ControlLeft", location: LEFT };
        keyIdentifierTable["U+00A3"] = { code: "ControlRight", location: RIGHT };
        keyIdentifierTable["U+00A4"] = { code: "AltLeft", location: LEFT };
        keyIdentifierTable["U+00A5"] = { code: "AltRight", location: RIGHT };
    }
    if ("chrome-mac" === browser_os) {
        keyIdentifierTable["U+0010"] = { code: "ContextMenu" };
    }
    if ("safari-mac" === browser_os) {
        keyIdentifierTable["U+0010"] = { code: "ContextMenu" };
    }
    if ("ios" === os) {
        // These only generate keyup events
        keyIdentifierTable["U+0010"] = { code: "Function" };

        keyIdentifierTable["U+001C"] = { code: "ArrowLeft" };
        keyIdentifierTable["U+001D"] = { code: "ArrowRight" };
        keyIdentifierTable["U+001E"] = { code: "ArrowUp" };
        keyIdentifierTable["U+001F"] = { code: "ArrowDown" };

        keyIdentifierTable["U+0001"] = { code: "Home" }; // [USB: 0x4a] Fn + ArrowLeft
        keyIdentifierTable["U+0004"] = { code: "End" }; // [USB: 0x4d] Fn + ArrowRight
        keyIdentifierTable["U+000B"] = { code: "PageUp" }; // [USB: 0x4b] Fn + ArrowUp
        keyIdentifierTable["U+000C"] = { code: "PageDown" }; // [USB: 0x4e] Fn + ArrowDown
    }

    //--------------------------------------------------------------------
    //
    // Location Mappings
    //
    //--------------------------------------------------------------------

    // Cases where newer-ish browsers send location/keyLocation which
    // can be used to disambiguate keys.

    // locationTable[location][keyCode] -> keyInfo
    var locationTable = [];
    locationTable[LEFT] = {
        0x10: { code: "ShiftLeft", location: LEFT }, // [USB: 0xe1]
        0x11: { code: "ControlLeft", location: LEFT }, // [USB: 0xe0]
        0x12: { code: "AltLeft", location: LEFT }, // [USB: 0xe2]
    };
    locationTable[RIGHT] = {
        0x10: { code: "ShiftRight", location: RIGHT }, // [USB: 0xe5]
        0x11: { code: "ControlRight", location: RIGHT }, // [USB: 0xe4]
        0x12: { code: "AltRight", location: RIGHT }, // [USB: 0xe6]
    };
    locationTable[NUMPAD] = {
        0x0d: { code: "NumpadEnter", location: NUMPAD }, // [USB: 0x58]
    };

    mergeIf(locationTable[NUMPAD], "moz", {
        0x6d: { code: "NumpadSubtract", location: NUMPAD }, // [USB: 0x56]
        0x6b: { code: "NumpadAdd", location: NUMPAD }, // [USB: 0x57]
    });
    mergeIf(locationTable[LEFT], "moz-mac", {
        0xe0: { code: "OSLeft", location: LEFT }, // [USB: 0xe3]
    });
    mergeIf(locationTable[RIGHT], "moz-mac", {
        0xe0: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
    });
    mergeIf(locationTable[RIGHT], "moz-win", {
        0x5b: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
    });

    mergeIf(locationTable[RIGHT], "mac", {
        0x5d: { code: "OSRight", location: RIGHT }, // [USB: 0xe7]
    });

    mergeIf(locationTable[NUMPAD], "chrome-mac", {
        0x0c: { code: "NumLock", location: NUMPAD }, // [USB: 0x53]
    });

    mergeIf(locationTable[NUMPAD], "safari-mac", {
        0x0c: { code: "NumLock", location: NUMPAD }, // [USB: 0x53]
        0xbb: { code: "NumpadAdd", location: NUMPAD }, // [USB: 0x57]
        0xbd: { code: "NumpadSubtract", location: NUMPAD }, // [USB: 0x56]
        0xbe: { code: "NumpadDecimal", location: NUMPAD }, // [USB: 0x63]
        0xbf: { code: "NumpadDivide", location: NUMPAD }, // [USB: 0x54]
    });

    //--------------------------------------------------------------------
    //
    // Key Values
    //
    //--------------------------------------------------------------------

    // Mapping from `code` values to `key` values. Values defined at:
    // https://dvcs.w3.org/hg/dom3events/raw-file/tip/html/DOM3Events-key.html
    // Entries are only provided when `key` differs from `code`. If
    // printable, `shiftKey` has the shifted printable character. This
    // assumes US Standard 101 layout

    var codeToKeyTable = {
        // Modifier Keys
        ShiftLeft: { key: "Shift" },
        ShiftRight: { key: "Shift" },
        ControlLeft: { key: "Control" },
        ControlRight: { key: "Control" },
        AltLeft: { key: "Alt" },
        AltRight: { key: "Alt" },
        OSLeft: { key: "OS" },
        OSRight: { key: "OS" },

        // Whitespace Keys
        NumpadEnter: { key: "Enter" },
        Space: { key: " " },

        // Printable Keys
        Digit0: { key: "0", shiftKey: ")" },
        Digit1: { key: "1", shiftKey: "!" },
        Digit2: { key: "2", shiftKey: "@" },
        Digit3: { key: "3", shiftKey: "#" },
        Digit4: { key: "4", shiftKey: "$" },
        Digit5: { key: "5", shiftKey: "%" },
        Digit6: { key: "6", shiftKey: "^" },
        Digit7: { key: "7", shiftKey: "&" },
        Digit8: { key: "8", shiftKey: "*" },
        Digit9: { key: "9", shiftKey: "(" },
        KeyA: { key: "a", shiftKey: "A" },
        KeyB: { key: "b", shiftKey: "B" },
        KeyC: { key: "c", shiftKey: "C" },
        KeyD: { key: "d", shiftKey: "D" },
        KeyE: { key: "e", shiftKey: "E" },
        KeyF: { key: "f", shiftKey: "F" },
        KeyG: { key: "g", shiftKey: "G" },
        KeyH: { key: "h", shiftKey: "H" },
        KeyI: { key: "i", shiftKey: "I" },
        KeyJ: { key: "j", shiftKey: "J" },
        KeyK: { key: "k", shiftKey: "K" },
        KeyL: { key: "l", shiftKey: "L" },
        KeyM: { key: "m", shiftKey: "M" },
        KeyN: { key: "n", shiftKey: "N" },
        KeyO: { key: "o", shiftKey: "O" },
        KeyP: { key: "p", shiftKey: "P" },
        KeyQ: { key: "q", shiftKey: "Q" },
        KeyR: { key: "r", shiftKey: "R" },
        KeyS: { key: "s", shiftKey: "S" },
        KeyT: { key: "t", shiftKey: "T" },
        KeyU: { key: "u", shiftKey: "U" },
        KeyV: { key: "v", shiftKey: "V" },
        KeyW: { key: "w", shiftKey: "W" },
        KeyX: { key: "x", shiftKey: "X" },
        KeyY: { key: "y", shiftKey: "Y" },
        KeyZ: { key: "z", shiftKey: "Z" },
        Numpad0: { key: "0" },
        Numpad1: { key: "1" },
        Numpad2: { key: "2" },
        Numpad3: { key: "3" },
        Numpad4: { key: "4" },
        Numpad5: { key: "5" },
        Numpad6: { key: "6" },
        Numpad7: { key: "7" },
        Numpad8: { key: "8" },
        Numpad9: { key: "9" },
        NumpadMultiply: { key: "*" },
        NumpadAdd: { key: "+" },
        NumpadComma: { key: "," },
        NumpadSubtract: { key: "-" },
        NumpadDecimal: { key: "." },
        NumpadDivide: { key: "/" },
        Semicolon: { key: ";", shiftKey: ":" },
        Equal: { key: "=", shiftKey: "+" },
        Comma: { key: ",", shiftKey: "<" },
        Minus: { key: "-", shiftKey: "_" },
        Period: { key: ".", shiftKey: ">" },
        Slash: { key: "/", shiftKey: "?" },
        Backquote: { key: "`", shiftKey: "~" },
        BracketLeft: { key: "[", shiftKey: "{" },
        Backslash: { key: "\\", shiftKey: "|" },
        BracketRight: { key: "]", shiftKey: "}" },
        Quote: { key: "'", shiftKey: '"' },
        IntlBackslash: { key: "\\", shiftKey: "|" },
    };

    mergeIf(codeToKeyTable, "mac", {
        OSLeft: { key: "Meta" },
        OSRight: { key: "Meta" },
    });

    // Corrections for 'key' names in older browsers (e.g. FF36-)
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent.key#Key_values
    var keyFixTable = {
        Esc: "Escape",
        Nonconvert: "NonConvert",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Menu: "ContextMenu",
        MediaNextTrack: "MediaTrackNext",
        MediaPreviousTrack: "MediaTrackPrevious",
        SelectMedia: "MediaSelect",
        HalfWidth: "Hankaku",
        FullWidth: "Zenkaku",
        RomanCharacters: "Romaji",
        Crsel: "CrSel",
        Exsel: "ExSel",
        Zoom: "ZoomToggle",
    };

    //--------------------------------------------------------------------
    //
    // Exported Functions
    //
    //--------------------------------------------------------------------

    var codeTable = remap(keyCodeToInfoTable, "code");

    try {
        var nativeLocation = nativeKeyboardEvent && "location" in new KeyboardEvent("");
    } catch (_) {}

    function keyInfoForEvent(event) {
        var keyCode = "keyCode" in event ? event.keyCode : "which" in event ? event.which : 0;

        var keyInfo = (function () {
            if (nativeLocation || "keyLocation" in event) {
                var location = nativeLocation ? event.location : event.keyLocation;
                if (location && keyCode in locationTable[location]) {
                    return locationTable[location][keyCode];
                }
            }
            if ("keyIdentifier" in event && event.keyIdentifier in keyIdentifierTable) {
                return keyIdentifierTable[event.keyIdentifier];
            }
            if (keyCode in keyCodeToInfoTable) {
                return keyCodeToInfoTable[keyCode];
            }
            return null;
        })();

        // TODO: Track these down and move to general tables
        if (0) {
            // TODO: Map these for newerish browsers?
            // TODO: iOS only?
            // TODO: Override with more common keyIdentifier name?
            switch (event.keyIdentifier) {
                case "U+0010":
                    keyInfo = { code: "Function" };
                    break;
                case "U+001C":
                    keyInfo = { code: "ArrowLeft" };
                    break;
                case "U+001D":
                    keyInfo = { code: "ArrowRight" };
                    break;
                case "U+001E":
                    keyInfo = { code: "ArrowUp" };
                    break;
                case "U+001F":
                    keyInfo = { code: "ArrowDown" };
                    break;
            }
        }

        if (!keyInfo) return null;

        var key = (function () {
            var entry = codeToKeyTable[keyInfo.code];
            if (!entry) return keyInfo.code;
            return event.shiftKey && "shiftKey" in entry ? entry.shiftKey : entry.key;
        })();

        return {
            code: keyInfo.code,
            key: key,
            location: keyInfo.location,
            keyCap: keyInfo.keyCap,
        };
    }

    function queryKeyCap(code, locale) {
        code = String(code);
        if (!codeTable.hasOwnProperty(code)) return "Undefined";
        if (locale && String(locale).toLowerCase() !== "en-us") throw Error("Unsupported locale");
        var keyInfo = codeTable[code];
        return keyInfo.keyCap || keyInfo.code || "Undefined";
    }

    if ("KeyboardEvent" in global && "defineProperty" in Object) {
        (function () {
            function define(o, p, v) {
                if (p in o) return;
                Object.defineProperty(o, p, v);
            }

            define(KeyboardEvent.prototype, "code", {
                get: function () {
                    var keyInfo = keyInfoForEvent(this);
                    return keyInfo ? keyInfo.code : "";
                },
            });

            // Fix for nonstandard `key` values (FF36-)
            if ("key" in KeyboardEvent.prototype) {
                var desc = Object.getOwnPropertyDescriptor(KeyboardEvent.prototype, "key");
                Object.defineProperty(KeyboardEvent.prototype, "key", {
                    get: function () {
                        var key = desc.get.call(this);
                        return keyFixTable.hasOwnProperty(key) ? keyFixTable[key] : key;
                    },
                });
            }

            define(KeyboardEvent.prototype, "key", {
                get: function () {
                    var keyInfo = keyInfoForEvent(this);
                    return keyInfo && "key" in keyInfo ? keyInfo.key : "Unidentified";
                },
            });

            define(KeyboardEvent.prototype, "location", {
                get: function () {
                    var keyInfo = keyInfoForEvent(this);
                    return keyInfo && "location" in keyInfo ? keyInfo.location : STANDARD;
                },
            });

            define(KeyboardEvent.prototype, "locale", {
                get: function () {
                    return "";
                },
            });
        })();
    }

    if (!("queryKeyCap" in global.KeyboardEvent)) global.KeyboardEvent.queryKeyCap = queryKeyCap;

    // Helper for IE8-
    global.identifyKey = function (event) {
        if ("code" in event) return;

        var keyInfo = keyInfoForEvent(event);
        event.code = keyInfo ? keyInfo.code : "";
        event.key = keyInfo && "key" in keyInfo ? keyInfo.key : "Unidentified";
        event.location =
            "location" in event
                ? event.location
                : "keyLocation" in event
                ? event.keyLocation
                : keyInfo && "location" in keyInfo
                ? keyInfo.location
                : STANDARD;
        event.locale = "";
    };
})(self);

v = true;
export default v;
