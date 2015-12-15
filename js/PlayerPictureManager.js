const PlayerPictureManager = (function() {"use strict";

function PlayerPictureManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    player.setPictureManager(this);
    this.favicon = $(null);
    this.current = Promise.resolve();
    this.newTrackLoaded = this.newTrackLoaded.bind(this);
    this.player.on("newTrackLoad", this.newTrackLoaded);
}

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype.updateImage = function(image) {
    const self = this;
    var $img = this.$().find("img");

    if ($img.length) {
        if (image && image.src === $img[0].src) return;

        this.current = this.current.then(function() {
            var animator = new Animator($img[0], {
                properties: [{
                    name: "opacity",
                    start: 1,
                    end: 0,
                    duration: 250
                }, {
                    name: "scale",
                    start: [1, 1],
                    end: [0.8, 0.8],
                    duration: 250
                }],
                interpolate: Animator.EASE
            });

            return animator.animate();
        }).then(function() {
            $img.remove();
        });
    }

    if (!image) return;
    image.width = image.height = 128;

    function clear() {
        $(image).off("load error");
    }

    this.current = this.current.then(function() {
        $(image).appendTo(self.$())
                    .css("opacity", 0)
                    .one("error", function() {
                        clear();
                        $(this).addClass("erroneous-image");
                    })
                    .one("load", function() {
                        clear();
                    });

        var animator = new Animator(image, {
            properties: [{
                name: "opacity",
                start: 0,
                end: 1,
                duration: 350
            }, {
                name: "scale",
                start: [0.8, 0.8],
                end: [1, 1],
                duration: 350
            }],
            interpolate: Animator.EASE
        });

        return animator.animate();
    }).then(function() {
        if (image.complete) clear();
        self.current = Promise.resolve();
        return null;
    });
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    this.updateImage(this.player.getImage());
};


return PlayerPictureManager;})();
