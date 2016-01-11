"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const keyValueDatabase = require("./KeyValueDatabase");
const Hotkeys = require("../lib/hotkeys");
const shiftKeys = Hotkeys.shiftKeys;
const GlobalUi = require("./GlobalUi");
const features = require("./features");
const usePerfectScrollbar = !features.touch;
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

const STORAGE_KEY = "hotkey-bindings-1";
const HOTKEY_TYPE_PERSISTENT = 0;
const HOTKEY_TYPE_NORMAL = 1;

var POPUP_HTML = "<div class='popup-content-container'>                                                          \
        <div class='hotkey-manager-columns-container'>                                                           \
            <div id='app-hotkeys-wrapper'>                                                                       \
                <div class='app-hotkey-header hotkey-manager-left-column'>Action</div>                           \
                <div class='hotkey-manager-left-column app-hotkey-header'>Bound to</div>                         \
                <div class='clear'></div>                                                                        \
                <div class='app-hotkeys-container ps-container'></div>                                           \
            </div>                                                                                               \
            <div class='hotkey-manager-description-container'>                                                   \
                <div class='hotkey-manager-description-header app-hotkey-header'>Description</div>               \
                <div class='app-describe-action'></div>                                                          \
            </div>                                                                                               \
            <div class='clear'></div>                                                                            \
        </div>                                                                                                   \
        <div class='hotkey-manager-stage-separator'>                                                             \
            <div class='app-hotkey-bind-container'>                                                              \
                <div class='notextflow hotkey-manager-binding-to-header left'>                                   \
                    Binding <span class='hotkey-action-name'></span> to:                                         \
                </div>                                                                                           \
                <div class='app-keybind-input app-stealth-input left'></div>                                     \
                    <div class='app-accept-bind app-popup-button left'>Apply</div>                               \
                <div class='app-deny-bind app-popup-button left'>Cancel</div>                                    \
                <div class='app-hotkey-unbind app-popup-button left'>Unbind</div>                                \
                <div class='clear'></div>                                                                        \
            </div>                                                                                               \
        </div></div>";

var HOTKEY_HTML = "<div class='clear app-hotkey-container'>                   \
    <div class='app-hotkey-name'></div>                                       \
    <div class='app-hotkey-binding'></div>                                    \
</div>";

function HotkeyManager(bindingMap, categories) {
    EventEmitter.call(this);
    this._descriptors = [];
    this._bindingMap = bindingMap;
    this._categories = categories;
    this._enabled = false;
}
util.inherits(HotkeyManager, EventEmitter);

HotkeyManager.prototype.setBindingMap = function(bindingMap) {
    this.disablePersistentHotkeys();
    this.disableHotkeys();
    this._bindingMap = bindingMap;
    this.enableHotkeys();
    this.enablePersistentHotkeys();
};

HotkeyManager.prototype._enableHotkeys = function(type) {
    if (type === HOTKEY_TYPE_NORMAL) {
        if (this._enabled) return;
        this._enabled = true;
        this.emit("enable", this);
    }
    Object.keys(this._bindingMap).forEach(function(action) {
        var keyCombination = this._bindingMap[action];
        var descriptor = this.getDescriptorForAction(action);

        if ((type === HOTKEY_TYPE_PERSISTENT && descriptor.persistent === true) ||
            (type === HOTKEY_TYPE_NORMAL && !descriptor.persistent)) {
            Hotkeys.add(keyCombination, descriptor.handler, descriptor.options);
        }
    }, this);
};

HotkeyManager.prototype._disableHotkeys = function(type) {
    if (type === HOTKEY_TYPE_NORMAL) {
        if (!this._enabled) return;
        this._enabled = false;
        this.emit("disable", this);
    }
    Object.keys(this._bindingMap).forEach(function(action) {
        var keyCombination = this._bindingMap[action];
        var descriptor = this.getDescriptorForAction(action);

        if ((type === HOTKEY_TYPE_PERSISTENT && descriptor.persistent === true) ||
            (type === HOTKEY_TYPE_NORMAL && !descriptor.persistent)) {
            Hotkeys.remove(keyCombination, descriptor.handler);
        }
    }, this);
};

HotkeyManager.prototype.enableHotkeys = function() {
    this._enableHotkeys(HOTKEY_TYPE_NORMAL);
};

HotkeyManager.prototype.disableHotkeys = function() {
    this._disableHotkeys(HOTKEY_TYPE_NORMAL);
};

HotkeyManager.prototype.enablePersistentHotkeys = function() {
    this._enableHotkeys(HOTKEY_TYPE_PERSISTENT);
};

HotkeyManager.prototype.disablePersistentHotkeys = function() {
    this._disableHotkeys(HOTKEY_TYPE_PERSISTENT);
};


HotkeyManager.prototype.addDescriptor = function(descriptor) {
    if (this._categories.indexOf(descriptor.category) === -1) {
        throw new Error("unknown category: " + descriptor.category);
    }
    this._descriptors.push(descriptor);
};

HotkeyManager.prototype.setBindingForDescriptor = function(descriptor, binding) {
    this._bindingMap[descriptor.action] = binding;
};

HotkeyManager.prototype.getBindingForDescriptor = function(descriptor) {
    return this._bindingMap[descriptor.action];
};

HotkeyManager.prototype.getDescriptorForAction = function(action) {
    for (var i = 0; i < this._descriptors.length; ++i) {
        if (this._descriptors[i].action === action) {
            return this._descriptors[i];
        }
    }
    throw new Error("unknown action:" + action);
};

HotkeyManager.prototype.getDescriptorsForCategory = function(category) {
    return this._descriptors.filter(function(descriptor) {
        return descriptor.category === category;
    });
};

HotkeyManager.prototype.getCategories = function() {
    return this._categories;
};

HotkeyManager.prototype.getDescriptors = function() {
    return this._descriptors;
};

HotkeyManager.prototype.saveBindings = function() {
    keyValueDatabase.set(STORAGE_KEY, this._bindingMap);
};

var defaults = {
    "Select all": "ctrl+a",
    "Filter": "j",
    "Next track": "ctrl+right arrow",
    "Previous track": "ctrl+left arrow",
    "Play selected": "enter",

    "Select next up": "up arrow",
    "Select next down": "down arrow",
    "Add next up": "shift+up arrow",
    "Add next down": "shift+down arrow",
    "Remove topmost": "alt+down arrow",
    "Remove bottommost": "alt+up arrow",
    "Move up": "ctrl+up arrow",
    "Move down": "ctrl+down arrow",

    "Select next page up": "pageup",
    "Select next page down": "pagedown",
    "Add next page up": "shift+pageup",
    "Add next page down": "shift+pagedown",
    "Remove topmost page": "alt+pagedown",
    "Remove bottommost page": "alt+pageup",
    "Move page up": "ctrl+pageup",
    "Move page down": "ctrl+pagedown",

    "Select first": "home",
    "Select last": "end",
    "Add all up": "shift+home",
    "Add all down": "shift+end",


    "Rate 1 star": "alt+1",
    "Rate 2 stars": "alt+2",
    "Rate 3 stars": "alt+3",
    "Rate 4 stars": "alt+4",
    "Rate 5 stars": "alt+5",

    "Remove rating": "alt+0",

    "Play": "z",
    "Pause": "x",
    "Stop": "c",
    "Normal mode": "b",
    "Shuffle mode": "n",
    "Repeat mode": "m",
    "Remove": "del",
    "Sort by album": "alt+q",
    "Sort by artist": "alt+w",
    "Sort by title": "alt+e",
    "Seek back": "left arrow",
    "Seek forward": "right arrow",
    "Volume down": "-",
    "Volume up": "+",
    "Toggle pause": "space",
    "Toggle mute": "alt+ctrl+m",
    "Open directory picker": "alt+d",
    "Open file picker": "alt+f",
    "Open hotkey manager": "alt+z",
    "Open equalizer": "alt+x",
    "Open crossfading options": "alt+c",
    "Toggle time display mode": "alt+t"
};

keyValueDatabase.getInitialValues().then(function(values) {
    if (STORAGE_KEY in values) {
        var bindingMap = {};
        $.extend(bindingMap, defaults, values[STORAGE_KEY]);
        hotkeyManager.setBindingMap(bindingMap);
    }
});

var hotkeyManager = new HotkeyManager(defaults, [
    "Music player", "Playlist management", "General actions"]);

util.onCapture(document, "keydown", function(e) {
    if (e.which === 27 && !e.ctrlKey &&
                          !e.shiftKey &&
                          !e.metaKey &&
                          !e.altKey) {
        $(window).trigger("clear");
    }
});

hotkeyManager.addDescriptor({
    category: "General actions",
    action: "Open hotkey manager",
    description: "Opens this popup.",
    handler: openHotkeyManager
});

function HotkeyBinding(hotkeyManager, hotkeyBinder, descriptor) {
    this.hotkeyManager = hotkeyManager;
    this.hotkeyBinder = hotkeyBinder;
    this.descriptor = descriptor;
    this.binding = hotkeyManager.getBindingForDescriptor(descriptor);

    var dom = $(HOTKEY_HTML);

    dom.bind("mouseenter", $.proxy(this.onMouseEnter, this));
    dom.bind("mouseleave", $.proxy(this.onMouseLeave, this));
    dom.bind("click", $.proxy(this.onClick, this));

    dom.find(".app-hotkey-name").text(this.descriptor.action);
    dom.find(".app-hotkey-binding").text(this.binding);
    this._domNode = dom;
}

HotkeyBinding.prototype.$ = function() {
    return this._domNode;
};

HotkeyBinding.prototype.setBindingTo = function(str) {
    this.binding = str;
    this.$().find(".app-hotkey-binding").text(this.binding);
};

HotkeyBinding.prototype.onMouseEnter = function() {
    this.hotkeyBinder.$().find(".app-describe-action").text(this.descriptor.description);
};

HotkeyBinding.prototype.onMouseLeave = function() {
    this.hotkeyBinder.$().find(".app-describe-action").text("");

};

HotkeyBinding.prototype.onClick = function() {
    this.hotkeyBinder.startBinding(this);
};

function HotkeyBinder(hotkeyManager, domNode) {
    this._currentlyBindingTo = null;
    this._currentHotkeyString = "";
    this._hotkeyManager = hotkeyManager;
    this._domNode = $(domNode);

    this.cancelBinding = $.proxy(this.cancelBinding, this);
    this.applyBinding = $.proxy(this.applyBinding, this);
    this.unbindBinding = $.proxy(this.unbindBinding, this);
    this.listenUserHotkeys = $.proxy(this.listenUserHotkeys, this);


    this.$().find(".app-accept-bind").bind("click", this.applyBinding);
    this.$().find(".app-deny-bind").bind("click", this.cancelBinding);
    this.$().find(".app-hotkey-unbind").bind("click", this.unbindBinding);
    $(document).bind("keydown", this.listenUserHotkeys);

    this._hotkeyBindings = [];
    hotkeyManager.getCategories().forEach(function(category) {
        var categoryRendered = false;
        var descriptors = hotkeyManager.getDescriptorsForCategory(category);
        descriptors.forEach(function(descriptor) {
            if (descriptor.allowRebind === false) return;

            if (!categoryRendered) {
                var dom = $('<div class="app-hotkey-category"></div>').text(category);
                this.$().find(".app-hotkeys-container").append(dom);
                categoryRendered = true;
            }
            var binding = new HotkeyBinding(hotkeyManager, this, descriptor);
            this.$().find(".app-hotkeys-container").append(binding.$());
            this._hotkeyBindings.push(binding);
        }, this);
    }, this);

    if (usePerfectScrollbar) this.$().find(".ps-container").perfectScrollbar();
}

HotkeyBinder.prototype.$ = function() {
    return this._domNode;
};

HotkeyBinder.prototype.listenUserHotkeys = function(e) {
    if (this._currentlyBindingTo) {
        e.preventDefault();
        var special = Hotkeys.keys[e.which];
        var character = String.fromCharCode(e.which).toLowerCase();
        var modifier = "";
        if (e.altKey && special !== "alt") modifier += "alt+";
        if (e.shiftKey && special !== "shift") modifier += "shift+";
        if (e.ctrlKey && special !== "ctrl") modifier += "ctrl+";
        if (e.metaKey && special !== "meta" && !e.ctrlKey) modifier += "meta+";

        var binding = "";
        if (special && modifier + special) {
            binding = modifier + special;
        } else if (modifier + character) {
            binding = modifier + character;
        } else if (modifier + shiftKeys[character]) {
            binding = modifier + shiftKeys[character];
        } else if (modifier === "shift+" && shiftKeys[character]) {
            binding = modifier + shiftKeys[character];
        }

        if (binding) {
            this.setCurrentHotkeyString(binding);
        }
    }
};

HotkeyBinder.prototype.setCurrentHotkeyString = function(value) {
    this._currentHotkeyString = value;
    this.$().find(".app-keybind-input").text(value);
};

HotkeyBinder.prototype.startBinding = function(hotkeyBinding) {
    this.cancelBinding();
    this.setCurrentHotkeyString(hotkeyBinding.binding);
    this.$().find(".hotkey-action-name").text(hotkeyBinding.descriptor.action);
    this._currentlyBindingTo = hotkeyBinding;
    this.$().find(".app-hotkey-bind-container").show();

};

HotkeyBinder.prototype.cancelBinding = function() {
    if (this._currentlyBindingTo) {
        this._currentlyBindingTo = null;
        this.$().find(".app-hotkey-bind-container").hide();
        this.setCurrentHotkeyString("");
    }
};

HotkeyBinder.prototype.applyBinding = function() {
    if (this._currentlyBindingTo) {
        if (this._currentHotkeyString) {
            this._hotkeyBindings.forEach(function(hotkeyBinding) {
                if (hotkeyBinding === this._currentlyBindingTo) {
                    hotkeyBinding.setBindingTo(this._currentHotkeyString);
                    this._hotkeyManager.setBindingForDescriptor(hotkeyBinding.descriptor, this._currentHotkeyString);
                } else if (hotkeyBinding.binding === this._currentHotkeyString) {
                    hotkeyBinding.setBindingTo("");
                    this._hotkeyManager.setBindingForDescriptor(hotkeyBinding.descriptor, "");
                }
            }, this);
        }
        this.stopBinding();
    }
};

HotkeyBinder.prototype.unbindBinding = function() {
    if (this._currentlyBindingTo) {
        this._currentlyBindingTo.setBindingTo("");
        this._hotkeyManager.setBindingForDescriptor(this._currentlyBindingTo.descriptor, "");
        this.stopBinding();
    }
};

HotkeyBinder.prototype.stopBinding = function() {
    this.cancelBinding();
    this._hotkeyManager.saveBindings();
};

HotkeyBinder.prototype.destroy = function() {
    if (usePerfectScrollbar) {
        this.$().find(".ps-container").perfectScrollbar('destroy');
    }
    $(document).unbind("keydown", this.listenUserHotkeys);
};


const hotkeyPopup = GlobalUi.makePopup("Shortcuts", POPUP_HTML, ".menul-hotkeys");
function openHotkeyManager() {
    hotkeyPopup.open();

    var hotkeyBinder = new HotkeyBinder(hotkeyManager, hotkeyPopup.$().find(".popup-content-container"));

    hotkeyPopup.once("close", function() {
        hotkeyBinder.destroy();
    });
}

$(".menul-hotkeys").click(openHotkeyManager);

if (touch) {
    $(".menul-hotkeys").on("touchstart touchend", domUtil.tapHandler(openHotkeyManager));
}

module.exports = hotkeyManager;
