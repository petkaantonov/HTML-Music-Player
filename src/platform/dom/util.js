"use strict";

import base64 from "base64-js";
import { URL, Blob, Image } from "platform/platform";

export function canvasToImage(canvas) {
    return new Promise(function(resolve) {
        var data = canvas.toDataURL("image/png").split("base64,")[1];
        resolve(new Blob([base64.toByteArray(data)], {type: "image/png"}));
    }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var image = new Image();
        image.src = url;
        image.blob = blob;
        image.isGenerated = true;
        return new Promise(function (resolve, reject) {
            if (image.complete) return resolve(image);

            function cleanup() {
                image.onload = image.onerror = null;
            }

            image.onload = function() {
                cleanup();
                resolve(image);
            };
            image.onerror = function() {
                cleanup();
                reject(new Error("cannot load image"));
            };
        }).finally(function() {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
        });
    });
}
