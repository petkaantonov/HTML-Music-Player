var YoutubeDl = require("./ytdl");

var ytdl = new YoutubeDl("xJJODSOHQkY");

process.on("uncaughtException", e => {
    console.log(e && e.stack || (e + ""));
});
