function ID3Process() {
this._queue = [];
this._ID3Type = this._ID3TypeReaderCreate();
this._ID3v2Read = this._ID3v2ReaderCreate();
this._ID3v1Read = this._ID3v1ReaderCreate();
}

ID3Process.artist = [ "TP1","TP1","TP1", "TPE1", "TPE1" ];
ID3Process.title = [ "TT2", "TT2", "TT2", "TIT2", "TIT2" ];
ID3Process.syncWord = /\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF]/;

ID3Process.bitrateIndex = [[0, 8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
			[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
			[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
			[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0]
];

ID3Process.samplerateIndex = [[11025, 12000, 8000, 0],
			[0,0,0,0],
			[22050, 24000, 16000, 0],
			[44100, 48000, 32000, 0]
];

ID3Process.Includes({
	BlobBuilder: window.BlobBuilder ||
		window.WebKitBlobBuilder ||
		window.MozBlobBuilder ||
		null,
		
	slice: window.File &&
		( window.File.prototype.slice ||
		window.File.prototype.webkitSlice ||
		window.File.prototype.mozSlice ) ||
		null,

	placeQueue: function( queue ){
	this._queue = this._queue.length ? this._queue.concat( queue ) : queue;
	
		if( !this.slice || !FileReader  ) {
		return false;
		}
		
	this._loadNext();
	},
	
	_getTimeFromXing: function( bytes, samplerate ) {
	var xing = bytes.indexOf( "Xing" ), info = bytes.indexOf( "Info" ),
		offset, flags, frameCount, frames;
	
		if( xing > -1 ) {
		offset = xing + 4;
		}else if ( info > -1 ) {
		offset = info + 4;
		}
		else {
		return null;
		}
	
	flags = bytes.substr( offset, 4 );
		if( flags.charCodeAt(3) % 2 === 1 && flags.charCodeAt(3) > 0 ) {
		offset += 4;
		frameCount = bytes.substr( offset, 4 );	
		frames = ( ( ( ( ( frameCount.charCodeAt( 0 ) << 8 ) +
			frameCount.charCodeAt( 1 ) ) << 8 ) +
			frameCount.charCodeAt( 2 ) ) << 8 ) +
			frameCount.charCodeAt( 3 );
		return ~~(1152 * frames / samplerate);
		}
		else {
		return null;
		}	
	},
	
	_getTimeFromVBRi: function( bytes, samplerate ) {
	var offset = bytes.indexOf( "VBRI" ),
		frameCount, frames;
		if( offset < 0 ) {
		return null;
		}
	offset += 14;
	frameCount = bytes.substr( offset, 4 );
	frames = ( ( ( ( ( frameCount.charCodeAt( 0 ) << 8 ) +
		frameCount.charCodeAt( 1 ) ) << 8 ) +
		frameCount.charCodeAt( 2 ) ) << 8 ) +
		frameCount.charCodeAt( 3 );
		
	return ~~(1152 * frames / samplerate);
	},
	
	_getTagSize: function( byteheader, version){
	var size = 0;
		if(version < 3){
		size = ((((byteheader.charCodeAt(3) << 8) + byteheader.charCodeAt(4)) << 8) + byteheader.charCodeAt(5)) < 0 ?
		((((byteheader.charCodeAt(3) << 8) + byteheader.charCodeAt(4)) << 8) + byteheader.charCodeAt(5)) + 16777216:
		((((byteheader.charCodeAt(3) << 8) + byteheader.charCodeAt(4)) << 8) + byteheader.charCodeAt(5));
		}
		else if(version == 3){
		size = (((((byteheader.charCodeAt(4) << 8) + byteheader.charCodeAt(5)) << 8) + byteheader.charCodeAt(6)) << 8) + byteheader.charCodeAt(7) < 0 ?
		(((((byteheader.charCodeAt(4) << 8) + byteheader.charCodeAt(5)) << 8) + byteheader.charCodeAt(6)) << 8) + byteheader.charCodeAt(7) + 4294967296:
		(((((byteheader.charCodeAt(4) << 8) + byteheader.charCodeAt(5)) << 8) + byteheader.charCodeAt(6)) << 8) + byteheader.charCodeAt(7);
		}
		else if(version > 3){
		size = byteheader.charCodeAt(7) & 0x7f | ((byteheader.charCodeAt(6) & 0x7f) << 7) | ((byteheader.charCodeAt(5) & 0x7f) << 14) | ((byteheader.charCodeAt(4) & 0x7f) << 21);
		}
	return size;
	},
	
	ontagdata: $.noop,
	
	_ID3v2Read: $.noop,
	
	_ID3v1Read: $.noop,
	
	_ID3Type: $.noop,
	
	_ID3TypeReaderCreate: function(){
	var self = this;
		return function(e){
		self._getID3Type( e.target.result, this );
		}
	},
	_ID3v2ReaderCreate: function(){
	var self = this;
		return function(e){
		self._getID3v2( e.target.result, this );
		}	
	
	},
	_ID3v1ReaderCreate: function(){
	var self = this;
		return function(e){
		self._getID3v1( e.target.result, this );
		}
	},
	
	_loadNext: function(){
	var item, obj;
		if( !this._queue.length ) {
		return false;
		}
	
	item = this._queue.shift();
	
		if( !item || item.url.constructor !== File ) {
		return this._loadNext();
		}
		
	var reader = new FileReader();
	reader.onload = jQuery.proxy( this._ID3Type, item );
	reader.readAsBinaryString( this.slice.call( item.url, 0, 10 ) );
	},
	_getID3Type: function( bytes, obj ){
	var ID3v2Pos = bytes.indexOf( "ID3" ),
		reader = new FileReader(), size, bb;
		
		if( ID3v2Pos > -1 ) {
		size = bytes.charCodeAt( 9 ) & 0x7f |
			( ( bytes.charCodeAt( 8 ) & 0x7f ) << 7 ) |
			( ( bytes.charCodeAt( 7 ) & 0x7f ) << 14 ) |
			( ( bytes.charCodeAt( 6 ) & 0x7f ) << 21 );
			
		reader.onload = jQuery.proxy( this._ID3v2Read, obj );
		reader.readAsBinaryString( this.slice.call( obj.url, ID3v2Pos, size+1527 ) );
		} 
		else {
		size = obj.url.size;
			if( !this.BlobBuilder ) {
			return;
			}
		bb = new this.BlobBuilder();
		bb.append( this.slice.call( obj.url, 0, 1527 ) );
		bb.append( this.slice.call( obj.url, size - 128, size ) );
		reader.onload = jQuery.proxy( this._ID3v1Read, obj );
		reader.readAsBinaryString( bb.getBlob() );
		}
	
	},
	_getID3v1: function( bytes, obj ) {
	var tagPos = bytes.indexOf( "TAG" ), title, artist, self = this,
		pTime = this._getDuration( bytes, true, obj );
		if( tagPos > -1 ) {
			this.ontagdata.call( this, {
				title: bytes.substr( tagPos + 3, 30 ),
				artist: bytes.substr( tagPos + 33, 30 ),
				hash: obj.hash,
				pTime: pTime
				}
			);
		}
	self._loadNext();
	},
	
	_getDuration: function( bytes, isv1, obj ) {
	var version2Bit,
		bitrate,
		samplerate,
		firstFrame,
		firstBytes = bytes.substr( isv1 ? 0 : bytes.length - 1527, 1527),
		syncWord = firstBytes.match( ID3Process.syncWord );
		
		if( syncWord ) {
		firstFrame = syncWord[0];
		version2Bit = ( firstFrame.charCodeAt( 1 ) & 0x18 ) >> 3;
		bitrate = ID3Process.bitrateIndex[ version2Bit ][ ( firstFrame.charCodeAt( 2 ) & 0xF0 ) >> 4 ];
		samplerate = ID3Process.samplerateIndex[ version2Bit ][ ( firstFrame.charCodeAt(2) & 0x0C) >> 2 ];

		return this._getTimeFromXing( firstBytes, samplerate ) ||
			this._getTimeFromVBRi( firstBytes, samplerate ) ||
			( ( obj.url.size / bitrate * 8 / 1000 ) >> 0 ) ||
			0;
		}
	return null;
	},
	
	_getID3v2: function( bytes, obj ) {
	var tagPos = bytes.indexOf( "ID3" ),
		version = bytes.charCodeAt( 3 ),
		artistPos = ID3Process.artist[version],
		titlePos = ID3Process.title[version],
		artistTagSize,
		titleTagSize,
		self = this,
		artist = null,
		pTime = this._getDuration( bytes, false, obj ),
		title = null,

	artistPos = bytes.indexOf( artistPos );
	titlePos = bytes.indexOf( titlePos );
	
		if( artistPos > -1 && titlePos > -1 ) {
		artistTagSize = this._getTagSize( bytes.substr( artistPos, 10 ), version);
		titleTagSize = this._getTagSize( bytes.substr( titlePos, 10 ), version);
			if( version < 3 ) {
			artist = bytes.substr( artistPos + 6, artistTagSize );
			title = bytes.substr( titlePos + 6, titleTagSize );
			} else {
			artist = bytes.substr( artistPos + 10, artistTagSize );
			title = bytes.substr( titlePos + 10, titleTagSize );
			}
		}
		
	this.ontagdata.call( this, {
		title: title,
		artist: artist,
		pTime: pTime,
		hash: obj.hash
		}
	);
	
	self._loadNext();
	}


});