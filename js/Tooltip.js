var Tooltip = (function() { "use strict";

const getDirection = function(value) {
    value = ("" + value).trim().toLowerCase();
    if (value === "right") return "right";
    if (value === "left") return "left";
    if (value === "up") return "up";
    if (value === "down") return "down";
    return "up";
};

const getArrowAlign = function(value) {
    value = ("" + value).trim().toLowerCase();
    if (value === "begin") return "begin";
    if (value === "end") return "end";
    if (value === "middle") return "middle";
    return "middle";
};

const NULL = $(null);

const offsetsFrom = function(child, parent) {
    var top = 0;
    var left = 0;
    var offsetParent = child;
    do {
        top += offsetParent.offsetTop;
        left += offsetParent.offsetLeft;
        offsetParent = offsetParent.offsetParent;
    } while (offsetParent && offsetParent !== parent);

    return {
        top: top,
        left: left
    };
};

const isFullyVisible = (function() {
    const contains = function(parent, child) {
        while (parent && child) {
            if (parent === child) return true;
            child = child.parentNode;
        }
        return false;
    };

    return function isFullyVisible(elem) {
        var rect = elem.getBoundingClientRect();
        var x1 = Math.ceil(rect.left);
        if (x1 === rect.left) x1++;
        var x2 = Math.floor(rect.right);
        if (x2 === rect.right) x2--;
        var y1 = Math.ceil(rect.top);
        if (y1 === rect.top) y1++;
        var y2 = Math.floor(rect.bottom);
        if (y2 === rect.bottom) y2--;

        return contains(elem, document.elementFromPoint(x1 + 2, y1 + 2)) &&
               contains(elem, document.elementFromPoint(x1 + 2, y2 - 2)) &&
               contains(elem, document.elementFromPoint(x2 - 2, y1 + 2)) &&
               contains(elem, document.elementFromPoint(x2 - 2, y2 - 2) /*bug*/);
    };
})();


const getConfigurationsToTryInOrder = function(direction, arrowAlign) {
    var arrowAligns, directions;

    switch (arrowAlign) {
        case "begin": arrowAligns = ["begin", "middle", "end"]; break;
        case "middle": arrowAligns = ["middle", "begin", "end"]; break;
        case "end": arrowAligns = ["end", "middle", "begin"]; break;
        default: throw new Error("invalid align");
    }

    switch (direction) {
        case "up": directions = ["up", "down", "left", "right"]; break;
        case "down": directions = ["down", "up", "left", "right"]; break;
        case "left": directions = ["left", "right", "up", "down"]; break;
        case "right": directions = ["right", "left", "up", "down"]; break;
        default: throw new Error("invalid direction");
    }

    var ret = new Array(directions.length * arrowAligns.length);
    ret.length = 0;

    for (var i = 0; i < directions.length; ++i) {
        for (var j = 0; j < arrowAligns.length; ++j) {
            ret.push({
                direction: directions[i],
                align: arrowAligns[j]
            });
        }
    }

    return ret;
};

function Tooltip(opts) {
    opts = Object(opts);
    this._preferredDirection = getDirection(opts.preferredDirection);
    this._domNode = $(opts.container);
    this._onContent = util.toFunction(opts.content);
    this._delay = Math.min(20000, Math.max(0, parseInt(opts.delay, 10))) || 300;
    this._delayTimeoutId = -1;
    this._target = typeof opts.target === "string" ? this.$().find(opts.target)
                                                   : opts.target;
    this._classPrefix = opts.classPrefix || "unprefixed-tooltip";
    this._transitionClass = opts.transitionClass || "";
    this._shown = false;
    this._tooltip = NULL;
    this._preferredArrowAlign = getArrowAlign(opts.preferredAlign);
    this._gap = parseInt(opts.gap, 10) || 7;

    this._show = this._show.bind(this);
    this.mouseLeft = this.mouseLeft.bind(this);
    this.mouseEntered = this.mouseEntered.bind(this);
    this.clicked = this.clicked.bind(this);

    this._target.on("mouseenter", this.mouseEntered);
    this._target.on("mouseleave", this.mouseLeft);
    this._target.on("click", this.clicked);
}


Tooltip.prototype._clearDelay = function() {
    if (this._delayTimeoutId !== -1) {
        clearTimeout(this._delayTimeoutId);
        this._delayTimeoutId = -1;
    }
};

Tooltip.prototype._createTooltipNode = function(message) {
    var containerClass = this._classPrefix.split(" ").map(function(v) {
        return v + "-container";
    }).join(" ") + " tooltip-container";
    var messageClass = this._classPrefix.split(" ").map(function(v) {
        return v + "-message";
    }).join(" ") + " tooltip-message";

    var html = "<div class='"+containerClass+"'>" +
            "<div class='"+messageClass+"'>" + message + "</div></div>";

    return $($.parseHTML(html)[0]);
};

Tooltip.prototype._show = function(noTransition) {
    this._clearDelay();
    if (this._shown) return;
    var content = this._onContent();
    if (content === false) return;
    this._shown = true;
    content = content + "";

    var $target = this._target;
    var $parent = this.$();
    var $node = this._createTooltipNode(content);

    this._tooltip = $node;
    $parent.append($node);
    $node.css({left: -9999, top: -9999});

    var nodeWidth = $node.outerWidth();
    var nodeHeight = $node.outerHeight();

    var targetOffsets = offsetsFrom($target[0], $parent[0]);
    var targetx1 = targetOffsets.left;
    var targetx2 = targetOffsets.left + $target.outerWidth();
    var targety1 = targetOffsets.top;
    var targety2 = targetOffsets.top + $target.outerHeight();
    var targetHalfWidth = (targetx2 - targetx1) / 2;
    var targetHalfHeight = (targety2 - targety1) / 2;
    var gap = this._gap;
    var configurations = getConfigurationsToTryInOrder(this._preferredDirection, this._preferredArrowAlign);

    $node.css({left: "auto", top: "auto"});
    var direction, align;

    // Keep trying configurations in preferred order until it is fully visible.
    for (var i = 0; i < configurations.length; ++i) {
        var configuration = configurations[i];
        direction = configuration.direction;
        align = configuration.align;
        var left = 0;
        var top = 0;

        if (direction === "up" || direction === "down") {
            if (align === "begin") {
                left = targetx1 + targetHalfWidth - gap * 2;
            } else if (align === "middle") {
                left = targetx1 + targetHalfWidth - (nodeWidth / 2);
            } else if (align === "end") {
                left = targetx1 + targetHalfWidth - nodeWidth + gap * 2;
            }

            if (direction === "up") {
                top = targety2 + gap * 2;
            } else {
                top = targety1 - nodeHeight - gap * 2;
            }
        } else {
            if (align === "begin") {
                top = targety1 + targetHalfHeight - gap * 2;
            } else if (align === "middle") {
                top = targety1 + targetHalfHeight - (nodeHeight / 2);
            } else if (align === "end") {
                top = targety1 + targetHalfHeight - nodeHeight + gap * 2;
            }

            if (direction === "left") {
                left = targetx2 + gap * 2;
            } else {
                left = targetx1 - nodeWidth - gap * 2;
            }
        }

        $node.css({left: left, top: top});

        if (isFullyVisible($node[0])) {
            break;
        }
    }

    this.renderArrow($node, direction, align);

    if (this._transitionClass) {
        if (noTransition) {
            $node.addClass(this._transitionClass);
        } else {
            $node.detach();
            $node.addClass(this._transitionClass + " initial");
            $node.appendTo($parent);
            $node[0].offsetHeight;
            $node.removeClass("initial");
        }
    }
};

Tooltip.prototype.refresh = function() {
    if (!this._shown) return;
    this.hide();
    this._show(true);
};

Tooltip.prototype.renderArrow = function($node, direction, align) {
    var gap = this._gap;
    if (gap <= 0) return;
    var backgroundColor = $node.css("backgroundColor");
    var borderColor = $node.css("borderColor");
    var borderWidth = parseInt($node.css("borderWidth"), 10) || 0;

    var nodeWidth = $node.outerWidth();
    var nodeHeight = $node.outerHeight();
    var backGroundArrowGap = borderWidth === 0 ? gap : Math.max(1, gap - borderWidth);
    var borderArrowTop = 0;
    var borderArrowLeft = 0;

    var left, top;
    var borderSpec = {};

    if (direction === "up") {
        top = -backGroundArrowGap;
        borderSpec = {
            right: [gap, false],
            left: [gap, false],
            top: [0, false],
            bottom: [gap, true]
        };

        if (align === "begin") {
            left = gap;
        } else if (align === "middle") {
            left = nodeWidth / 2 - gap;
        } else if (align === "end") {
            left = nodeWidth - gap * 2 - gap;
        }

        borderArrowTop = top - borderWidth;
        borderArrowLeft = left;
    } else if (direction === "down") {
        top = nodeHeight - gap / 2;
        borderSpec = {
            right: [gap, false],
            left: [gap, false],
            top: [gap, true],
            bottom: [0, false],
        };

        if (align === "begin") {
            left = gap;
        } else if (align === "middle") {
            left = nodeWidth / 2 - gap;
        } else if (align === "end") {
            left = nodeWidth - gap * 2 - gap;
        }

        borderArrowTop = top + borderWidth;
        borderArrowLeft = left;
    } else if (direction === "left") {
        left = -backGroundArrowGap;
        borderSpec = {
            right: [gap, true],
            left: [0, false],
            top: [gap, false],
            bottom: [gap, false]
        };

        if (align === "begin") {
            top = gap;
        } else if (align === "middle") {
            top = nodeHeight / 2 - gap;
        } else if (align === "end") {
            top = nodeHeight - gap * 2 - gap;
        }


        borderArrowTop = top;
        borderArrowLeft = left - borderWidth;
    } else if (direction === "right") {
        left = nodeWidth - gap / 2;
        borderSpec = {
            right: [0, false],
            left: [gap, true],
            top: [gap, false],
            bottom: [gap, false]
        };

        if (align === "begin") {
            top = gap;
        } else if (align === "middle") {
            top = nodeHeight / 2 - gap;
        } else if (align === "end") {
            top = nodeHeight - gap * 2 - gap;
        }

        borderArrowTop = top;
        borderArrowLeft = left + borderWidth;
    }

    var backgroundArrow = $("<div>").css({
        position: "absolute",
        top: top,
        left: left,
        borderStyle: "solid",
        borderRightWidth: borderSpec.right[0],
        borderLeftWidth: borderSpec.left[0],
        borderTopWidth: borderSpec.top[0],
        borderBottomWidth: borderSpec.bottom[0],
        borderRightColor: borderSpec.right[1] ? backgroundColor : "transparent",
        borderLeftColor: borderSpec.left[1] ? backgroundColor : "transparent",
        borderTopColor: borderSpec.top[1] ? backgroundColor : "transparent",
        borderBottomColor: borderSpec.bottom[1] ? backgroundColor : "transparent",
        zIndex: 2
    });

    backgroundArrow.appendTo($node);

    if (borderWidth !== 0) {
        var borderArrow = $("<div>").css({
            position: "absolute",
            top: borderArrowTop,
            left: borderArrowLeft,
            borderStyle: "solid",
            borderRightWidth: borderSpec.right[0],
            borderLeftWidth: borderSpec.left[0],
            borderTopWidth: borderSpec.top[0],
            borderBottomWidth: borderSpec.bottom[0],
            borderRightColor: borderSpec.right[1] ? borderColor : "transparent",
            borderLeftColor: borderSpec.left[1] ? borderColor : "transparent",
            borderTopColor: borderSpec.top[1] ? borderColor : "transparent",
            borderBottomColor: borderSpec.bottom[1] ? borderColor : "transparent",
            zIndex: 1
        });

        borderArrow.appendTo($node);
    }
};

Tooltip.prototype.hide = function() {
    this._clearDelay();
    if (!this._shown) return;
    this._shown = false;
    this._tooltip.remove();
    this._tooltip = NULL;
};

Tooltip.prototype.mouseEntered = function() {
    this._clearDelay();
    this._delayTimeoutId = setTimeout(this._show, this._delay);
};

Tooltip.prototype.mouseLeft = function(e) {
    this.hide();
};

Tooltip.prototype.clicked = function() {
    this.hide();
};

Tooltip.prototype.destroy = function() {
    if (this._target) {
        this.hide();
        this._target.off("mouseenter", this.mouseEntered);
        this._target.off("mouseleave", this.mouseLeft);
        this._target = this._domNode = null;
    }
};

Tooltip.prototype.$ = function() {
    return this._domNode;
};

return Tooltip; })();
