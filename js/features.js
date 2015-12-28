"use strict";
const $ = require("../lib/jquery");

var features = module.exports;
var input = document.createElement("input");

features.allowMimes = ["audio/mp3"];
features.allowExtensions = "mp1,mp2,mp3,mpg,mpeg".split(",");

features.readFiles = typeof FileReader == "function" && new FileReader()
    .readAsBinaryString;
features.directories = ("webkitdirectory" in input ||
    "directory" in input ||
    "mozdirectory" in input);
features.touch = ('ontouchstart' in window) ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;

if (!features.touch) {
    $("body").addClass("no-touch");
}
