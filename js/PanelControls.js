const PanelControls = (function() { "use strict";
var ret = {};



ret.makeTooltip = function(target, content) {
    return new Tooltip({
        activation: "hover",
        transitionClass: "fade-in",
        preferredDirection: "up",
        preferredAlign: "begin",
        container: $("body"),
        arrow: false,
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content
    });
};

ret.makePopup = function(title, body) {
    const PREFERENCE_KEY = title + "position";

    ret = new Popup({
        title: title,
        body: body,
        closer: '<span class="icon glyphicon glyphicon-remove"></span>',
        transitionClass: "popup-fade-in",
        containerClass: "ui-text"
    });

    ret.on("open", function() {
        hotkeyManager.disableHotkeys();
    });

    ret.on("close", function() {
        hotkeyManager.enableHotkeys();
        keyValueDatabase.set(title + "position", ret.getPreferredPosition());
    });

    keyValueDatabase.getInitialValues().then(function(values) {
        if (PREFERENCE_KEY in values) ret.setPreferredPosition(values[PREFERENCE_KEY]);
    });

    $(window).on("clear", ret.close.bind(ret));
    return ret;
};

return ret; })();
