(function () {
    function c() {
        d.style.display = "none";
        e = [];
    }
    var e = [],
        f = 0,
        g = !1,
        d,
        a,
        b;
    self.uiLog = function () {
        var h = [].slice.call(arguments);
        if (!g)
            return setTimeout(function () {
                d = document.getElementById("ui-log-container");
                a = document.getElementById("close-log");
                b = document.getElementById("ui-log");
                if (d && a && b) {
                    g = !0;
                    try {
                        a.addEventListener("click", c, { passive: !0, capture: !0 }),
                            a.addEventListener("touchstart", c, { passive: !0, capture: !0 });
                    } catch (l) {
                        (a.onclick = c), (a.ontouchstart = c);
                    }
                }
                self.uiLog.apply(null, h);
            }, 100);
        e.push(h.join(" "));
        d.style.display = "block";
        0 === f && (f = Math.floor(b.clientHeight / 12));
        e.length > f && e.shift();
        var k = e.join("\n");
        void 0 !== b.textContent ? (b.textContent = k) : (b.innerText = k);
    };
    self.onerror = function () {
        var a = [].slice.call(arguments);
        self.uiLog.apply(self, a);
    };
})();

if (self.addEventListener) {
    self.addEventListener("unhandledrejection", function (event) {
        self.uiLog(event.reason.stack);
    });
}
