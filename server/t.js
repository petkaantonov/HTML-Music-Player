var YoutubeDl = require("./ytdl");

var ytdl = new YoutubeDl("xJJODSOHQkY");

ytdl.start().then(data => {
    console.log(data);
});

process.on("uncaughtException", e => {
    console.log(e && e.stack || (e + ""));
});
