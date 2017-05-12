var YoutubeDl = require("./ytdl");

var ytdl = new YoutubeDl("xJJODSOHQkY");

ytdl.start().then(data => {
    console.log(data);
});
