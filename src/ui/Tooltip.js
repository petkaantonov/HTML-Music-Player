"use strict";

import EventEmitter from "events";
import { inherits, toFunction } from "util";

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

const getActivationStyle = function(value) {
    value = ("" + value).trim().toLowerCase();

    if (value === "hover" ||
        value === "focus" ||
        value === "click") {
        return value;
    }
    return "hover";
};

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

export default function Tooltip(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.page = opts.page;
    this.recognizerContext = opts.recognizerContext;
    this.globalEvents = opts.globalEvents;
    this._preferredDirection = getDirection(opts.preferredDirection);
    this._domNode = this.page.$(opts.container);
    this._onContent = toFunction(opts.content);
    this._delay = Math.min(20000, Math.max(0, parseInt(opts.delay, 10))) || 300;
    this._delayTimeoutId = -1;
    this._target = typeof opts.target === "string" ? this.$().find(opts.target)
                                                   : this.page.$(opts.target).eq(0);
    this._classPrefix = opts.classPrefix || "unprefixed-tooltip";
    this._transitionClass = opts.transitionClass || "";
    this._shown = false;
    this._tooltip = this.page.NULL();
    this._preferredArrowAlign = getArrowAlign(opts.preferredAlign);
    this._activationStyle = getActivationStyle(opts.activation);
    this._arrow = "arrow" in opts ? !!opts.arrow : this._activationStyle === "hover";
    this._gap = "gap" in opts ? parseInt(opts.gap, 10) : (this._arrow ? 7 : 0);
    this._x = 0;
    this._y = 0;
    this._maxX = 0;
    this._maxY = 0;

    this._show = this._show.bind(this);
    this.mouseLeft = this.mouseLeft.bind(this);
    this.mouseEntered = this.mouseEntered.bind(this);
    this.mousemoved = this.mousemoved.bind(this);
    this.clicked = this.clicked.bind(this);
    this.documentClicked = this.documentClicked.bind(this);
    this.hide = this.hide.bind(this);
    this.position = this.position.bind(this);
    this.hide = this.hide.bind(this);
    this.targetClicked = this.targetClicked.bind(this);
    this.hoverRecognizer = this.recognizerContext.createHoverRecognizer(this.mouseEntered, this.mouseLeft);
    this.targetTapRecognizer = this.recognizerContext.createTapRecognizer(this.targetClicked);
    this.tapRecognizer = this.recognizerContext.createTapRecognizer(this.clicked);
    this.documentTapRecognizer = this.recognizerContext.createTapRecognizer(this.documentClicked);


    if (this._activationStyle === "hover") {
        this.$target()
                .addEventListener("mouseenter", this.mouseEntered)
                .addEventListener("mouseleave", this.mouseLeft)
                .addEventListener("click", this.targetClicked);
        this.hoverRecognizer.recognizeBubbledOn(this.$target());
        this.targetTapRecognizer.recognizeBubbledOn(this.$target());
    } else if (this._activationStyle === "click") {
        this.$target().addEventListener("click", this.clicked);
        this.page.addDocumentListener("click", this.documentClicked);
        this.tapRecognizer.recognizeBubbledOn(this.$target());
        this.documentTapRecognizer.recognizeCapturedOn(this.page.document());
    }

    this.globalEvents.on("resize", this.position);
    this.globalEvents.on("visibilityChange", this.hide);
}
inherits(Tooltip, EventEmitter);

Tooltip.prototype.$ = function() {
    return this._domNode;
};

Tooltip.prototype.$target = function() {
    return this._target;
};

Tooltip.prototype.$tooltip = function() {
    return this._tooltip;
};

Tooltip.prototype._clearDelay = function() {
    this.page.clearTimeout(this._delayTimeoutId);
    this._delayTimeoutId = -1;
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

    return this.page.parse(html);
};

Tooltip.prototype.clicked = function() {
    this._clearDelay();
    if (this._shown) {
        this.hide();
    } else {
        var box = this.$target()[0].getBoundingClientRect();
        this._x = box.left;
        this._y = box.top;
        this._show();
    }
};

Tooltip.prototype.documentClicked = function(e) {
    if (!this._shown) return;
    if (this.page.$(e.target).closest(this.$target()).length === 0) {
        this._clearDelay();
        this.hide();
    }
};

Tooltip.prototype.position = function() {
    if (!this._shown) return;
    var $node = this.$tooltip();
    var baseX = this._x;
    var baseY = this._y;
    var maxX = this.page.width();
    var maxY = this.page.height();
    var box = $node[0].getBoundingClientRect();

    if (maxX !== this._maxX || maxY !== this._maxY) {
        baseX = baseX * (maxX / this._maxX);
        this._x = baseX;

        baseY = baseY * (maxY / this._maxY);
        this._y = baseY;

        this._maxX = maxX;
        this._maxY = maxY;
    }

    var gap = this._gap;
    var configurations = getConfigurationsToTryInOrder(this._preferredDirection, this._preferredArrowAlign);
    var direction, align;
    var targetBox = this.$target()[0].getBoundingClientRect();
    var cursorSize = this._activationStyle === "hover" ? 21 : 0;
    var targetSizeX = this._activationStyle === "hover" ? 0 : targetBox.width;
    var targetSizeY = this._activationStyle === "hover" ? 0 : targetBox.height;

    // Keep trying configurations in preferred order until it is fully visible.
    var positionFound = false;
    var tryMinMax = false;
    while (!positionFound) {
        for (var i = 0; i < configurations.length; ++i) {
            var configuration = configurations[i];
            direction = configuration.direction;
            align = configuration.align;
            var left = 0;
            var top = 0;

            if (direction === "up" || direction === "down") {
                if (align === "begin") {
                    left = baseX - gap;
                } else if (align === "middle") {
                    left = baseX - box.width / 2;
                } else if (align === "end") {
                    left = baseX - box.width + gap;
                }

                if (direction === "up") {
                    top = baseY + gap + cursorSize + targetSizeY;
                } else {
                    top = baseY - gap - cursorSize - box.height;
                }
            } else {
                if (align === "begin") {
                    top = baseY - gap;
                } else if (align === "middle") {
                    top = baseY - box.height / 2;
                } else if (align === "end") {
                    top = baseY - box.height + gap;
                }

                if (direction === "left") {
                    left = baseX + gap + cursorSize + targetSizeX;
                } else {
                    left = baseX - gap - cursorSize - box.width;
                }
            }

            if (tryMinMax) {
                left = Math.min(maxX - box.width, Math.max(0, left));
                top = Math.min(maxY - box.height, Math.max(0, top));
                if (left >= 0 && left + box.width <= maxX &&
                    top >= 0 && top + box.height <= maxY) {
                    $node.setStyles({left: left + "px", top: top + "px"});
                    positionFound = true;
                    break;
                }
            } else if (left >= 0 && left + box.width <= maxX &&
                top >= 0 && top + box.height <= maxY) {
                $node.setStyles({left: left + "px", top: top + "px"});
                positionFound = true;
                break;
            }
        }

        if (tryMinMax) {
            break;
        }
        tryMinMax = true;
    }

    if (this._arrow) {
        $node.find(".tooltip-arrow-rendering").remove();
        this.renderArrow($node, direction, align);
    }
};

Tooltip.prototype._show = function(isForRepaintOnly) {
    this.$target().removeEventListener("mousemove", this.mousemoved);
    this._clearDelay();
    if (this._shown) return;
    this._maxX = this.page.width();
    this._maxY = this.page.height();
    var content = this._onContent();
    if (content === false) return;
    this._shown = true;
    content = content + "";

    var $parent = this.page.$("body");
    var $node = this._createTooltipNode(content);

    this._tooltip = $node;
    $parent.append($node);
    $node.setStyles({
        position: "absolute",
        left: "-9999px",
        top: "-9999px",
        zIndex: "1000"
    });

    this.position();

    if (this._transitionClass) {
        if (isForRepaintOnly) {
            $node.addClass(this._transitionClass);
        } else {
            $node.detach()
                .addClass([this._transitionClass, "initial"])
                .appendTo($parent)
                .forceReflow($node)
                .removeClass("initial");
        }
    }

    if (!isForRepaintOnly) {
        this.emit("show", this);
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
    var style = $node.style();
    var backgroundColor = style.backgroundColor;
    var borderColor = style.borderColor;
    var borderWidth = parseInt(style.borderWidth, 10) || 0;

    var nodeWidth = $node[0].offsetWidth;
    var nodeHeight = $node[0].offsetHeight;
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

    var backgroundArrow = this.page.createElement("div")
                    .addClass("tooltip-arrow-rendering")
                    .setStyles({
                        position: "absolute",
                        top: top + "px",
                        left: left + "px",
                        borderStyle: "solid",
                        borderRightWidth: borderSpec.right[0] + "px",
                        borderLeftWidth: borderSpec.left[0] + "px",
                        borderTopWidth: borderSpec.top[0] + "px",
                        borderBottomWidth: borderSpec.bottom[0] + "px",
                        borderRightColor: borderSpec.right[1] ? backgroundColor : "transparent",
                        borderLeftColor: borderSpec.left[1] ? backgroundColor : "transparent",
                        borderTopColor: borderSpec.top[1] ? backgroundColor : "transparent",
                        borderBottomColor: borderSpec.bottom[1] ? backgroundColor : "transparent",
                        zIndex: "2"
                    });

    backgroundArrow.appendTo($node);

    if (borderWidth !== 0) {
        var borderArrow = this.page.createElement("div")
            .addClass("tooltip-arrow-rendering")
            .setStyles({
                position: "absolute",
                top: borderArrowTop + "px",
                left: borderArrowLeft + "px",
                borderStyle: "solid",
                borderRightWidth: borderSpec.right[0] + "px",
                borderLeftWidth: borderSpec.left[0] + "px",
                borderTopWidth: borderSpec.top[0] + "px",
                borderBottomWidth: borderSpec.bottom[0] + "px",
                borderRightColor: borderSpec.right[1] ? borderColor : "transparent",
                borderLeftColor: borderSpec.left[1] ? borderColor : "transparent",
                borderTopColor: borderSpec.top[1] ? borderColor : "transparent",
                borderBottomColor: borderSpec.bottom[1] ? borderColor : "transparent",
                zIndex: "1"
            });

        borderArrow.appendTo($node);
    }
};

Tooltip.prototype.targetClicked = function() {
    return this.hide();
};

Tooltip.prototype.hide = function() {
    this.$target().removeEventListener("mousemove", this.mousemoved);
    this._clearDelay();
    if (!this._shown) return;
    this._shown = false;
    if (this._transitionClass) {
        var $node = this.$tooltip();
        var $parent = $node.parent();
        $node.detach()
            .addClass(this._transitionClass)
            .removeClass("initial")
            .appendTo($parent)
            .forceReflow()
            .addClass("initial");

        var self = this;
        this.page.setTimeout(function() {
            if (!self._shown) {
                self.$tooltip().remove();
                self._tooltip = self.page.NULL();
            }
        }, 500);
    } else {
        this.$tooltip().remove();
        this._tooltip = this.page.NULL();
    }
    this.emit("hide", this);
};

Tooltip.prototype.mousemoved = function(e) {
    this._clearDelay();
    this._x = e.clientX;
    this._y = e.clientY;
    this._delayTimeoutId = this.page.setTimeout(this._show, this._delay);
};

Tooltip.prototype.mouseEntered = function(e) {
    this.$target().addEventListener("mousemove", this.mousemoved);
    this.mousemoved(e);
};

Tooltip.prototype.mouseLeft = function() {
    this.hide();
};

Tooltip.prototype.destroy = function() {
    this.globalEvents.removeListener("resize", this.position);
    this.globalEvents.removeListener("visibilityChange", this.hide);

    this.page.removeDocumentListener("click", this.documentClicked);
    this.documentTapRecognizer.unrecognizeCapturedOn(this.page.document());

    if (this.$target() && this.$target().length) {
        this.hide();
        this.$target().removeEventListener("mouseenter", this.mouseEntered)
                        .removeEventListener("mouseleave", this.mouseLeft)
                        .removeEventListener("click", this.targetClicked)
                        .removeEventListener("click", this.clicked);
        this.hoverRecognizer.unrecognizeBubbledOn(this.$target());
        this.targetTapRecognizer.unrecognizeBubbledOn(this.$target());
        this.tapRecognizer.unrecognizeBubbledOn(this.$target());
        this._target = this._domNode = null;
    }
};
