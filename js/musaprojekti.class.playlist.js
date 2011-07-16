function Playlist( selectable, opts ) {
this._hashBase = +( ( +new Date ).toString().substr(0,5) );
this._selectable = selectable;
this._hashList = [];
this._songList = {};
this._mode = opts && opts.mode || "normal";
this._itemHeight = opts && opts.itemHeight || 15;
this._currentSong = null;
this._songHistory = [];
this._queue = [];
this.length = 0;
	if( opts && opts.songList ) {
	this.add( opts.songList );
	}
}

Playlist.Modes = {
	normal: function( value ) {
		if( value >= ( this.length - 1 ) ) {
		return 0;
		}
	return ++value;
	},
	shuffle: function( value ) {
	var rand = ( Math.random() * this.length + 0 ) >> 0;
		while( rand === value && this.length > 1 ) {
		rand = ( Math.random() * this.length + 0 ) >> 0;
		}
	return rand;
	},

	repeat: function( value ) {
	return value;
	}
};

Playlist.Includes({
	onhistory: $.noop,
	onplaylistempty: $.noop,
	onloadneed: $.noop,
	onadd: $.noop,
	onremove: $.noop,
	getContainer: function(){
	return this._hashList;
	},
	
	getVisibleSongs: function(){
	var elm = document.getElementById( this._selectable._target ),
		height = this._itemHeight,
		$l = this._hashList.length,
		scrolled = ( elm.scrollTop / height ) >> 0,
		item,
		hash,
		ret = [],
		visible = ( elm.clientHeight / height ) >> 0;
		
		for( var i = scrolled, l = scrolled+visible+1; i < l && i < $l; ++i ) {
		hash = this._hashList[ i ];
		item = this._songList[ hash ];
			if( item.parsed === false ) {
			item.hash = hash;
			ret.push( item );
			}
		
		}
	return ret;
	},
	
	getPositionByHash: function( hash ) {
	return this._hashList.indexOf( hash );
	},
	modifySongByHash: function( hash, obj ) {
	var key, song = this._songList[hash];
		if( song ) {
		
			for ( key in obj ) {
			song[key] = obj[key];
			}
		
			if( hash === this._currentSong ) {
			this.onchange.call( this, song, this.getPositionByHash( hash ), hash );
			}
		}
	return this;
	},
	getSongByHash: function( hash ) {
	var i, l, r = [];
		if( hash.constructor !== Array ) {
		return this._songList[hash];
		}
	
	l = hash.length;
		
		for( i = 0; i < l; ++i ) {
		r.push( this._songList[hash[i]] );
		}
	
	return r;	
	},
	getHashByIndex: function( index ) {
	return this._hashList[index] || -1;
	},
	reorder: function( callback ) {
		if( typeof callback == "function" ) {
		callback( this._hashList );
		}
	return this;
	},
	remove: function( arr ) {
	var i, l, spliced, val, idx;
		if( arr.constructor !== Array ) {
		arr = [arr];
		}
		
	l = arr.length;
		for( i = 0; i < l; ++i ) {
		val = arr[i];
			if( ( idx = this._hashList.indexOf( val ) ) > -1 ) {
			this._hashList.splice( idx, 1 );
			delete this._songList[ val ];
			}
		}
	this.length = this._hashList.length;
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection );
	this.onremove.call( this, arr.length );
	this._selectable.max = this._hashList.length;
	return this;
	},
	add: function( arr, offset ) {
	var i, l, curhash, ref = this._hashList, ret = [],
		obj;
	
		if( arr.constructor !== Array ) {
		arr = [arr];
		}
	l = arr.length;
	
		if( offset && offset >= 0 && offset < this._hashList.length ) {
			for( i = 0; i < l; ++i ) {
			curhash = this._getHash();
			this._songList[ curhash ] = arr[ i ];
			ret.push( curhash );
			
			}
		ref.splice.apply( ref, [offset, 0].concat( ret ) );
		}
		else {

			for( i = 0; i < l; ++i ) {
			curhash = this._getHash();
			this._songList[ curhash ] = arr[ i ];
			ret.push( curhash );
			ref.push( curhash );
			}
		
		}
		

		
	this.length = this._hashList.length;
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection || []);
	this.onadd.call( this, arr.length );
	this._selectable.max = this._hashList.length;
	return ret;
	},
	
	changeSongFromHistory: function( idx ){
	
		if( this._songHistory[idx] && this.getPositionByHash( this._songHistory[idx] ) > -1 ){
		this.changeSong( this._songHistory[idx], true );
		}
	
	},
	
	changeSong: function ( hash, nohistory ) {
	this._queue = [];
		if( !this.length ) {
		this._currentSong = null;
		this.onplaylistempty.call( this );
		return false;
		}
		
	var songObj = this._songList[ hash ], index = this._hashList.indexOf( hash );

		if( index < 0 || !songObj ) {
		this.next();
		}
	

		
		if( index < 0 || index >= this.length || typeof songObj != "object" ) {
		return this.next();
		}
		
	this._currentSong = hash;
	

		
		this.onchange.call(	this,
				songObj,
				index,
				hash
		);
		if( !nohistory ) {
		this._songHistory.push( this._currentSong );
		this.onhistory.call( this, this._songList[this._currentSong], this._currentSong, this._songHistory.length - 1 );
		}
		this.onloadneed.call( this, songObj );
		
	return true;
	},
	prev: function() {
		if( this._songHistory.length ) {
		return this.changeSong( this._songHistory.pop(), true );
		}
		
	return this.changeSong( this._hashList[0], true );
	},
	__NEXT: function(){
	var cursong, nextsong;
	cursong = this._currentSong === null ? -1 : this._currentSong;
	nextsong = Playlist.Modes[ this._mode ].call( this, this._hashList.indexOf( cursong ) );
		if( this.length === 0 ) {
		return false;
		}
	this._queue.push( this._hashList[ nextsong ] );
	return this._songList[this._hashList[nextsong]];
	},
	next: function(){
	var cursong, nextsong;
	
		if( this._queue.length ) {
		return this.changeSong( this._queue.pop() );
		}
		
	cursong = this._currentSong === null ? -1 : this._currentSong;
	nextsong = Playlist.Modes[ this._mode ].call( this, this._hashList.indexOf( cursong ) );
	return this.changeSong( this._hashList[nextsong] );
	},
	changeMode: function( mode ) {
		switch( !!Playlist.Modes[ mode ] ) {
		case true:
		this._mode = mode;
		break;
		
		default:
		break;
		}
	},
	clear: function(){
	this._hashList = [];
	this._songList = {};
	this._currentSong = null;
	this._songHistory = [];
	this._queue = [];
	this.render();
	},
	toArray: function( hashes ){
	var r = [], i, l = this._hashList.length, elm, hash;
	
		for( i = 0; i < l; ++i ) {
		hash = this._hashList[i];
		elm = this._songList[ hash ];
			if( hashes ) {
			elm.hash = hash;
			}
		r.push( elm );
		}
	return r;
	},
	_getHash: function() {
	var curhash = this._hashBase;
	this._hashBase = curhash + ( ( Math.random() * 30 + 3 ) >> 0 );
	return ""+curhash;
	},
	render: function() {
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection || []);
	return this;
	},
	onupdate: jQuery.noop,
	onchange: jQuery.noop
});