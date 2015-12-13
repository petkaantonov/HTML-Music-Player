const PlayerPictureManager = (function() {"use strict";

function PlayerPictureManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    player.setPictureManager(this);
    this.favicon = $(null);
    this.image = null;

    this.newTrackLoaded = this.newTrackLoaded.bind(this);

    this.player.on("newTrackLoad", this.newTrackLoaded);
}

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype.updateImage = function(image) {
    $(this.image).remove();
    const self = this;

    this.$().find("img").remove();
    if (!image) return;

    this.image = image;
    image.width = image.height = 128;

    $(image).one("error", function() {
        $(this).addClass("erroneous-image");
    });

    $(image).addClass("fade-in initial").appendTo(this.$());
    image.offsetWidth;
    $(image).removeClass("initial").addClass("end");
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    this.updateImage(this.player.getImage());
};


return PlayerPictureManager;})();
