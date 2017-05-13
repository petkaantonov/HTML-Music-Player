var YoutubeDl = require("./ytdl");

var ytdl = new YoutubeDl("xJJODSOHQkY");

ytdl.start().then(data => {
    console.log(data);
    ytdl.streamAudio(10947264, 72000).pipe(require("fs").createWriteStream("last3seconds.mp3"));
});

process.on("uncaughtException", e => {
    console.log(e && e.stack || (e + ""));
});
