function LocalFiles( allowMime, allowExt ){
var i, l;
this._mimes = {};
this._extensions = {};
	for( i = 0, l = allowMime && allowMime.length || 0; i < l; ++i ) {
	this._mimes[allowMime[i]] = true;
	}
	for( i = 0, l = allowExt && allowExt.length || 0; i < l; ++i ) {
	this._extensions[allowExt[i]] = true;
	}
	
}

LocalFiles.Includes({
	oncomplete: $.noop,
	onvalidfile: $.noop,
	handle: function( files ){
	var l = files && files.length, i, name, type, handle, r = [], testStr = this._allowed,
		file, ext, exts = this._extensions, mimes = this._mimes, c = 0;
	
		if( !l ) {
		return this;
		}
		
		for( i = 0; i < l; ++i ) {
		file = files[i];
		ext = file.name.substr( file.name.lastIndexOf( "." ) + 1 );
		type = file.type;
		
			if( ext in exts || type in mimes ) {
			c++;
			this.onvalidfile.call( this, file, type, ext );
			}
		}
	this.oncomplete.call( this, c );
	return this;
	}
});