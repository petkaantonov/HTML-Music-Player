const PlayerPictureManager = (function() {"use strict";

function PlayerPictureManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    this.currentPictureLoad = null;
    this.favicon = $(null);

    this.newTrackLoaded = this.newTrackLoaded.bind(this);

    this.player.on("newTrackLoad", this.newTrackLoaded);
}

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    const self = this;

    if (self.currentPictureLoad) {
        self.currentPictureLoad.cancel();
        self.currentPictureLoad = null;
    }


    self.$().find("img").remove();
    $("favicon").remove();
    self.favicon.remove();
    var image = self.player.getImage();
    if (!image) return;

    self.currentPictureLoad = image.getElementAsync().then(function(img) {
        if (img === null) return;
        img.width = 128;
        img.height = 128;
        $(img).addClass("fade-in initial").appendTo(self.$());
        img.offsetWidth;
        $(img).removeClass("initial").addClass("end");
        self.favicon = $("<link>", {rel: "shortcut icon", href: img.src}).appendTo($("head"));

    }).catch(function(e) {})
    .finally(function() {
        self.currentPictureLoad = null;
    });
};


return PlayerPictureManager;})();
