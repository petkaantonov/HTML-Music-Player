var FileError = util.subClassError("FileError", function(fileError) {
    this.message = fileError.message;
    this.name = fileError.name;
});
