window.CSS_LOAD_START = performance.now();
/*! loadCSS: load a CSS file asynchronously. [c]2016 @scottjehl, Filament Group, Inc. Licensed MIT */
(function (k) {
    var e = function (e, f, c) {
        function l(a) {
            if (b.body) return a();
            setTimeout(function () {
                l(a);
            });
        }
        var b = k.document,
            a = b.createElement("link"),
            g = c || "all",
            d;
        f ? (d = f) : ((c = (b.body || b.getElementsByTagName("head")[0]).childNodes), (d = c[c.length - 1]));
        var m = b.styleSheets;
        a.rel = "stylesheet";
        a.href = e;
        a.media = "only x";
        l(function () {
            d.parentNode.insertBefore(a, f ? d : d.nextSibling);
        });
        var h = function (b) {
            for (var d = a.href, c = m.length; c--; ) if (m[c].href === d) return b();
            setTimeout(function () {
                h(b);
            });
        };
        a.addEventListener &&
            a.addEventListener("load", function () {
                this.media = g;
            });
        a.onloadcssdefined = h;
        h(function () {
            a.media !== g && (a.media = g);
        });
        return a;
    };
    "undefined" !== typeof exports ? (exports.loadCSS = e) : (k.loadCSS = e);
})("undefined" !== typeof global ? global : this);
function onloadCSS(a, c) {
    function b() {
        !d && c && ((d = !0), c.call(a));
    }
    var d;
    a.addEventListener && a.addEventListener("load", b);
    a.attachEvent && a.attachEvent("onload", b);
    if ("isApplicationInstalled" in navigator && "onloadcssdefined" in a) a.onloadcssdefined(b);
}
(function () {
    var a = !1,
        b;
    onloadCSS(loadCSS("$APP_CSS_PATH"), function () {
        a = !0;
        b && b();
    });
    window.cssLoaded = function (c) {
        return a
            ? c.resolve()
            : new c(function (a) {
                  b = a;
              });
    };
})();
