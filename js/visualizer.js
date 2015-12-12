(function() {"use strict";
    const getFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
    const cancelFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame;
    const canvas = document.getElementById("visualizer");
    const context = canvas.getContext("2d");

    const MAX_FFT_FREQUENCY = 18500;
    const BYTE_MAX_SIZE = 255;
    const CAP_DROP_TIME_DEFAULT = 550;
    const ALPHA_TIME_DEFAULT = 385;
    const CAP_HOLDOUT_TIME = 55;
    const CAP_DROP_TIME_IDLE = CAP_DROP_TIME_DEFAULT;


    const WIDTH = parseInt(canvas.width, 10);
    const HEIGHT = parseInt(canvas.height, 10);

    const BIN_WIDTH = 4;
    const GAP_WIDTH = 1;
    const BIN_SPACE = BIN_WIDTH + GAP_WIDTH;

    const CAP_HEIGHT = 1;
    const CAP_SEPARATOR = 2;
    const CAP_SPACE = CAP_HEIGHT + CAP_SEPARATOR;

    const HIGHEST_Y = HEIGHT - CAP_SPACE;
    const gradients = new Array(HEIGHT + 1);

    // Someone please tell me there is a better way....
    for (var i = 0; i < gradients.length; ++i) {
        var gradient = context.createLinearGradient(0, HEIGHT - i, 0, HEIGHT);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');
        gradients[i] = gradient;
    }

    context.shadowBlur = 2;
    context.shadowColor = "rgb(11,32,53)";

    const NUM_BINS = Math.floor(WIDTH / BIN_SPACE);
    Player.visualizerBins(NUM_BINS);
    const CAP_STYLE = "rgb(37,117,197)";
    const BIN_STYLE = gradient;

    const capInfoArray = new Array(NUM_BINS);

    for (var i = 0; i < capInfoArray.length; ++i) {
        capInfoArray[i] = {
            started: -1,
            binValue: -1
        };
    }

    function easeInQuad(x, t, b, c, d) {
        return c*(t/=d)*t + b;
    }

    var capDropTime = CAP_DROP_TIME_DEFAULT;

    function getCapPosition(position, now) {
        if (position.binValue === -1) {
            return 0;
        }
        if (position.started === -1 || ((now - position.started) > capDropTime)) {
            position.binValue = -1;
            return 0;
        }
        var elapsed = now - position.started;
        var duration = capDropTime;
        if (elapsed < CAP_HOLDOUT_TIME) return position.binValue;
        return (1 - easeInQuad(0, elapsed, 0, 1, duration)) * position.binValue;
    }

    function resetCaps() {
        for (var i = 0; i < capInfoArray; ++i) {
            capInfoArray[i].started = -1;
            capInfoArray[i].binValue = -1;
        }
    }

    function drawCap(x, capSample, capInfo, now) {
        var alpha = 1 - (capInfo.started >= 0 ?
            Math.min(1, (now - capInfo.started) / ALPHA_TIME_DEFAULT) : 0);
        var capY = capSample * HIGHEST_Y + CAP_SPACE;
        context.fillRect(x, HEIGHT - capY, BIN_WIDTH, CAP_HEIGHT);
        var originalY = capY - CAP_SPACE - 1;
        context.fillStyle = "rgb(184, 228, 246)";
        context.save();
        context.globalAlpha = alpha * 0.9;
        context.shadowBlur = 0;
        context.fillRect(x, HEIGHT - originalY, BIN_WIDTH, originalY);
        context.restore();
    }

    function drawBins(event) {
        var bins = event.bins;
        var now = event.now;
        for (var i = 0; i < bins.length; ++i) {
            var binValue = bins[i];
            var capInfo = capInfoArray[i];
            var y = binValue * HIGHEST_Y;
            var x = i * BIN_SPACE;

            var capSample = -1;
            if (capInfo.binValue === -1) {
                capInfo.binValue = binValue;
            } else {
                capSample = getCapPosition(capInfo, now);
            }

            context.fillStyle = CAP_STYLE;
            if (binValue < capSample) {
                drawCap(x, capSample, capInfo, now);
            } else {
                context.fillRect(x, HEIGHT - y - CAP_SPACE, BIN_WIDTH, CAP_HEIGHT);
                capInfo.binValue = binValue;
                capInfo.started = now;
            }
            context.fillStyle = gradients[y|0];
            context.fillRect(x, HEIGHT - y, BIN_WIDTH, y);
        }
    }

    var needToDrawIdleBins = true;
    function drawIdleBins(event) {
        var drewSomething = false;
        for (var i = 0; i < NUM_BINS; ++i) {
            var capInfo = capInfoArray[i];
            if (capInfo.binValue !== -1) {
                drewSomething = true;
            }
            context.fillStyle = CAP_STYLE;
            drawCap(i * BIN_SPACE, getCapPosition(capInfo, event.now), capInfo);
        }

        if (!drewSomething) {
            needToDrawIdleBins = false;
        }
    }

    var nothingToDraw = 0;
    player.main.on("visualizerData", function(event) {
        var fresh = false;

        if (event.paused) {
            capDropTime = CAP_DROP_TIME_IDLE;
            nothingToDraw++;

            if (needToDrawIdleBins) {
                context.clearRect(0, 0, WIDTH, HEIGHT);
                drawIdleBins(event);
            }
            return;
        } else {
            needToDrawIdleBins = true;
            if (nothingToDraw > 0) {
                fresh = true;
            }
            nothingToDraw = 0;
        }
        capDropTime = CAP_DROP_TIME_DEFAULT;
        context.clearRect(0, 0, WIDTH, HEIGHT);
        if (fresh) resetCaps();
        drawBins(event);
    });

    player.main.on("stop", function() {
        var frame;
        player.main.once("play", function() {
            if (frame) cancelAnimationFrame(frame);
        });
        frame = requestAnimationFrame(function loop(now) {
            if (needToDrawIdleBins) {
                frame = requestAnimationFrame(loop);
                context.clearRect(0, 0, WIDTH, HEIGHT);
                drawIdleBins({now: now});
            } else {
                frame = null;
            }
        });
    });

    resetCaps();
    drawIdleBins({now: Date.now()});
})();
;
