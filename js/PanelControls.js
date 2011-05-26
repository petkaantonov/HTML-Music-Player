const PanelControls = (function() { "use strict";
var ret = {};



ret.makeTooltip = function(target, content) {
    return new Tooltip({
        transitionClass: "fade-scale-in",
        preferredDirection: "up",
        preferredAlign: "middle",
        container: $("body"),
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content
    });
};

return ret; })();
