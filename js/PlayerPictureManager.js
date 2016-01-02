"use strict";
const $ = require("../lib/jquery");
const Animator = require("./Animator");

const START_SCALE = 0.95;
const END_SCALE = 1;
const START_ALPHA = 0;
const END_ALPHA = 1;

function PlayerPictureManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    player.setPictureManager(this);
    this.favicon = $(null);

    
    this._currentImage = null;
    this._currentAnimation = null;
    this._awaitingAnimation = null;

    this._next = this._next.bind(this);
    this.newTrackLoaded = this.newTrackLoaded.bind(this);
    this.player.on("newTrackLoad", this.newTrackLoaded);
}

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype._startTransitioningOut = function(startState) {
    var self = this;

    var image = this._currentImage;
    var animator = new Animator(image, {
        properties: [{
            name: "opacity",
            start: startState ? startState.alpha : END_ALPHA,
            end: START_ALPHA,
            duration: 300
        }, {
            name: "scale",
            start: [startState ? startState.scale : END_SCALE,
                    startState ? startState.scale : END_SCALE],
            end: [START_SCALE, START_SCALE],
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });

    return animator.animate().finally(function() {
        $(image).remove();
        self._next();
    });
};

PlayerPictureManager.prototype._startTransitioningIn = function(image) {
    var self = this;

    this._currentImage = image;
    this._attachCurrentImage();
    var animator = new Animator(image, {
        properties: [{
            name: "opacity",
            start: START_ALPHA,
            end: END_ALPHA,
            duration: 300
        }, {
            name: "scale",
            start: [START_SCALE, START_SCALE],
            end: [END_SCALE, END_SCALE],
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });

    return animator.animate().then(function() {
        self._next();
    });
};

PlayerPictureManager.prototype._next = function() {
    this._currentAnimation = null;
    if (this._awaitingAnimation) {
        this._currentAnimation = this._startTransitioningIn(this._awaitingAnimation);
        this._awaitingAnimation = null;
    }
};

PlayerPictureManager.prototype._attachCurrentImage = function() {
    var image = this._currentImage;
    $(image).css({
        opacity: START_ALPHA,
        transform: "scale(" + START_SCALE + "," +  START_SCALE + ")"
    }).appendTo(this.$());

    if (!image.complete) {
        $(image).one("error", function() {
            $(image).off("load error");
            $(this).addClass("erroneous-image");
        }).one("load", function() {
            $(image).off("load error");
        });
    }
};

PlayerPictureManager.prototype._getCurrentAnimationState = function() {
    var $img = $(this._currentImage);

    return {
        alpha: $img.css("opacity"),
        scale: +($img.css("transform").match(/(?:scale|matrix)\s*\(\s*(\d+(?:\.\d+)?)/i)[1])
    };
};
Error.stackTraceLimit = 1000;
PlayerPictureManager.prototype.updateImage = function(image) {
    if (!image) return;
    if (this._currentImage && image.src === this._currentImage.src &&
        (!this._awaitingAnimation || this._awaitingAnimation && this._awaitingAnimation.src === image.src)) {
        return;
    }

    image.width = image.height = 116;

    if (!this._currentAnimation) {
        if (this._currentImage) {
            this._currentAnimation = this._startTransitioningOut();
            this._awaitingAnimation = image;
        } else {
            this._currentAnimation = this._startTransitioningIn(image);
        }
    } else if (!this._awaitingAnimation) {
        this._currentAnimation.cancel();
        this._currentAnimation = this._startTransitioningOut(this._getCurrentAnimationState());
        this._awaitingAnimation = image;
    } else {
        this._awaitingAnimation = image;
    }
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    this.updateImage(this.player.getImage());
};


module.exports = PlayerPictureManager;
