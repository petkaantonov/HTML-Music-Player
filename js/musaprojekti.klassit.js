/**
 * @constructor
 * @name JSONP
 * @description Creates a cross domain JSONP request wrapper
 * @param {String} url - Location of json callback
 * @param {Object} [opts] - Options
 *
 * @option {Object} params   - Parameters to pass to the get request, object with key-value pairs
 * @option {String} callback - anonymous callback function or reference to a function, defaults to no callback
 * @option {String} callbackP -  the identifier of the callback function in request, defaults to "callback"
 * @option {Number} timeout -  seconds before the jsonp request times out, defaults to 30. In case of a timeout,
 *				callback function will be called with null as the first argument
 *
 * @example
 *
 *
 * function fn( response ) {
 * alert( response );
 * }
 *
 * var jsonp = new JSONP( "http://www.google.com", {callback: fn, params: {datatype: "json-p"} }
 * jsonp.execute(); 
 * 
 * 
*/
function JSONP( url, opts ) {
var params, key, parastr = "", pararr = [];
this._url = url;

this._callback = opts && typeof opts.callback == "function" && opts.callback || function(){};
this._callbackP = opts && opts.callbackP || "callback";
this._timeout = opts && opts.timeout || 30;
params = opts && typeof opts.params == "object" && opts.params || {};

	for( key in params ) {
	pararr.push( encodeURIComponent( key ) + "=" + encodeURIComponent( params[key] ) );
	}

this._parastr = pararr && pararr.length && pararr.join( "&" ) || "";

}


window.__callbackForJSONPctr = 0;
window.__callbackForJSONP = {};

JSONP.prototype = {
	constructor: JSONP,

/**
 *
 * @name JSONP#execute
 * @method
 * @description Executes the JSONP request, deleting the created script element right after.
 * @return the JSONP object
 * 
 * 
*/
	execute: function() {
	var script = document.createElement( "script" ), str = "", callbackEnc, funcEnc, num = window.__callbackForJSONPctr,
		body = document.getElementsByTagName( "body" )[0];
	
	funcEnc = encodeURIComponent( "__callbackForJSONP["+window.__callbackForJSONPctr+"].cb" );
	callbackEnc = encodeURIComponent( this._callbackP ) + "=" + funcEnc;
	
	str = this._parastr ? this._parastr + "&" + callbackEnc : callbackEnc;
	str = this._url + "?" + str;
	
	script.type = "text/javascript";

	window.__callbackForJSONP[ num ] = {};
	window.__callbackForJSONP[ num ].cb = this._backcaller( this._callback, script, num );
	script.src = str;
	body.appendChild( script );
	
		window.__callbackForJSONP[ num ].timeoutID = window.setTimeout( function(){
		window.__callbackForJSONP[ num ].cb( null );
		}, this._timeout * 1000 );
	
	window.__callbackForJSONPctr++;
	return this;
	},
	
	_backcaller: function( fn, script, num ) {
	
		return function() {
		var args = Array.prototype.slice.call( arguments, 0 );
		script.parentNode.removeChild( script );
		fn.apply( window, args );
		window.clearTimeout( window.__callbackForJSONP[ num ].timeoutID );
		script = null;
		delete window.__callbackForJSONP[ num ];
		};

	}

};

function NodeCache(){
this._cache = {};
this._cacheid = 1;
this._exp = "data-node"+( +new Date );
}
NodeCache.Includes({
	_removeData: function( elem ) {
	var id = elem[ this._exp ];
	
		if( id == null )
		return;

	delete this._cache[ id ];

		try { 
		delete elem[ this._exp ];
		}
		catch(e){
		elem.removeAttribute( this._exp  );
		}
	return this;
	},

	_getData: function( elem ) {
	var id = elem[ this._exp ];

		if( id == null ) {
		id = elem[ this._exp  ] = this._cacheid++;
		this._cache[id] = {};
		}

	return this._cache[id];
	},
	_purgeCache: function() {
	var key;
		for( key in this._cache ) {
		delete this._cache[key];
		}
	return this;
	}
});


/* Generic class for creating tabs based user interface */

function Tabs ( target, nodecache, tabsopts ) {
var elms, t, i, l, data, frag, ul, li, caption, disabled, getdata, length, idprefix, cclass, node;

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target == null || nodecache == null ) {
	return {};
	}

	if( target.id == null )
	target.id = "tabs-"+(+new Date );


this._nodecache = nodecache;

disabled = ( tabsopts && tabsopts.disabled && ( " " + tabsopts.disabled.join( " " ) + " " ) ) || "";

this._containerId = target.id;
this._idxprefix = idxprefix = "tabs-tab-" + (+ new Date );

this.ontabselect = tabsopts && typeof tabsopts.ontabselect == "function" ? tabsopts.ontabselect : function(){};
this._classPrefix = ( tabsopts && tabsopts.classPrefix ) || "tabs-default";
this._tabCaptions =  ( tabsopts && tabsopts.captions) || [];
this._contentHolderClass = cclass = ( tabsopts && tabsopts.holderClass ) || "tabs-default-holder";
this._contentHolder = tabsopts && tabsopts.contentHolder || target;
this._contentHolder = typeof this._contentHolder == "string" ? document.getElementById( this._contentHolder ) : this._contentHolder;

this._selected = null;
this.length = 0;
getData = this._nodecache._getData;
t = this._contentHolder.getElementsByTagName( "*" );


l = t.length;
frag = document.createDocumentFragment();
ul = document.createElement("ul");
ul.id = this._tabsContainerId = "tabs-container"+(+new Date );
ul.className = this._classPrefix+"-tabs-container";


 
	for( i = 0; i < l; ++i ) {
	node = t[i];
	
		if( ( " " + node.className + " " ).indexOf( " " + cclass + " " ) > -1 ) {
		node.style.display = "none";
		li = document.createElement("li");
		data = getData.call( nodecache, li );
		length = this.length;
		li.id = idxprefix + length;
		data.caption = caption = this._tabCaptions[ length ] || "Tab "+( length + 1 );
		data.elem = node;
		data.nth = length;
		li.className = this._classPrefix+"-tab";
		li.innerHTML = caption;
		
			if( disabled.indexOf( " " + length + " " ) > -1 )
			this.disableTab( li );
			
		ul.appendChild(li);
		this.length++;
		}
	}
frag.appendChild(ul);
target.insertBefore( frag, target.firstChild );
	if( typeof tabsopts.select == "number")
	this.selectTab( this.getTab( tabsopts.select  ));
}
Tabs.Includes({
	length: 0,
	activeTab: 0,
	onbeforetabselect: function(){},
	ontabselect: function(){},

	_accessControl: function( elem, disabled ) {
	var i, l;
		if( typeof elem == "number")
		elem = this.getTab(elem );

		else if ( elem.constructor == Array ) {
		l = elem.length;
			for( i = 0; i < l; ++i ) {
			this._accessControl( this.getTab(elem[i]), disabled )
			}
		return this;
		}
	var data = this._nodecache._getData( elem );
	data.disabled = disabled ? true : false;
	CSS[(disabled ? "add" : "remove")+"Class"]( elem, this._classPrefix+"-tab-disabled" );
	return this;

	},

	disableTab: function( elem ) {
	return this._accessControl( elem, true );

	},

	prevTab: function() {
	var tabidx = this.activeTab - 1, tab, data, cache = this._nodecache, getData = cache._getData;

		if( tabidx < 0 )
		tabidx = 0;

	tab = this.getTab( tabidx );
	data = getData.call( cache, tab );

		while( data.disabled && --tabidx > 0 ) {
		tab = this.getTab( tabidx );
		data = getData.call( cache, tab );
		}

		if( data.disabled )
		return this;

	this.selectTab( tab );
	},

	nextTab: function() {
	var tabidx = this.activeTab + 1, tab, data, len = this.length - 1, cache = this._nodecache, getData = cache._getData;

		if( tabidx >= len )
		tabidx = len;

	tab = this.getTab( tabidx );
	data = getData.call( cache, tab );

		while( data.disabled && ++tabidx <= len ) {
		tab = this.getTab( tabidx );
		data = getData.call( cache, tab );
		}

		if( data.disabled )
		return this;

	this.selectTab( tab );

	},

	enableTab: function( elem ) {
	return this._accessControl( elem, false );
	},
	selectTab: function( elem ) {
	var data, data2, cache = this._nodecache, getData = cache._getData;
		
	data = getData.call( cache, elem )
	
		if( data.disabled == true || elem == this._selected ) {
		return this;
		}
		
	this.onbeforetabselect.call( this, this.activeTab, this._selected );

		if( this._selected != null ) {
		data2 = getData.call( cache, this._selected );
		data2.elem.style.display = "none";
		$( this._selected ).removeClass( this._classPrefix+"-tab-selected" );
		}
		

	data.elem.style.display = "block";
	this._selected = elem;
	this.activeTab = data.nth;
	$( this._selected ).addClass( this._classPrefix+"-tab-selected");
	this.ontabselect.call( this, this.activeTab, elem );
	return this;
	},

	getIndex: function( elem ){
	var cache = this._nodecache, data = cache._getData.call( cache, elem );
	return data.nth || null;
	},

	getTab: function( nth ){
	return typeof nth == "number" ? document.getElementById( this._idxprefix+nth ) : document.getElementById( this._tabsContainerId );
	}

});



function Playlist( selectable, opts ) {
this._hashBase = +( ( +new Date ).toString().substr(0,5) );
this._selectable = selectable;
this._hashList = [];
this._songList = {};
this._mode = opts && opts.mode || "normal";
this._currentSong = null;
this._songHistory = [];
this._queue = [];
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
	onadd: function(count){},
	onremove: function(count){},
	getContainer: function(){
	return this._hashList;
	},
	getPositionByHash: function( hash ) {
	return this._hashList.indexOf( hash );
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
	var i, l, curhash, upper, lower, middle, ref = this._hashList;
	
		if( arr.constructor !== Array ) {
		arr = [arr];
		}
	l = arr.length;
	
		if( offset && offset >= 0 && offset < this._hashList.length ) {
		lower = this._hashList.slice( 0, offset );
		upper = this._hashList.slice( offset );
		middle = [];
		ref = middle;
		}

		for( i = 0; i < l; ++i ) {
		curhash = this._getHash();
		this._songList[ curhash ] = arr[ i ];
		ref.push( curhash );
		}
		
		if( middle && lower && upper ) {
		this._hashList = lower.concat( ref, upper );
		}
		
	this.length = this._hashList.length;
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection );
	this.onadd.call( this, arr.length );
	this._selectable.max = this._hashList.length;
	return this;
	},
	
	changeSong: function ( hash, nohistory ) {
		if( !this.length ) {
		return this;
		}
		
	var songObj = this._songList[ hash ], index = this._hashList.indexOf( hash );

	
		if( this._currentSong !== null && !nohistory ) {
		this._songHistory.push( this._currentSong );
		}
		
		if( index < 0 || index >= this.length || typeof songObj != "object" ) {
		return this.next();
		}
		
	this._currentSong = hash;
	this.onchange.call(	this,
				songObj,
				index
	);
	
	},
	prev: function() {
		if( this._songHistory.length ) {
		return this.changeSong( this._songHistory.pop(), true );
		}
		
	this.changeSong( this._hashList[0], true );
	},
	next: function(){
	var cursong, nextsong;
	
		if( this._queue.length ) {
		return this.changeSong( this._queue.pop() );
		}
		
	cursong = this._currentSong === null ? -1 : this._currentSong;
	nextsong = Playlist.Modes[ this._mode ].call( this, this._hashList.indexOf( cursong ) );
	this.changeSong( this._hashList[nextsong] );
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
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection );
	return this;
	},
	onupdate: function( songList, hashList, curSong, selections ){},
	onchange: function( songObj, curSong ){}
});



function Selectable( target, selector, opts ) {
var self = this;
this._max = 0;
this._target = typeof target == "string" ? document.getElementById( target ) : target;
this._selector = selector;
this._activeClass = opts && opts.activeClass || "select-active";
this._selectionPointer = null;
this._lastIdx = null;
this._lastStart = null;
this._lastEnd = null;
this._selection = [];

	$( this._target ).delegate( selector, "mousedown click", function( e ) {
	var target = e.target, idx = +( this.id.substr( this.id.lastIndexOf("-") + 1 ) );
	
		if( e.type == "click" ) {
			if( !e.ctrlKey && !e.shiftKey) {
			self._resetPointers();
			self._selection = [];
			self._addSelection( idx );
			}
		self._preventClick = false;
		return true;
		}
	
		if( e.which !== 1 ){
		return true;
		}

		if( e.shiftKey && e.ctrlKey ){
			if(self._selectionPointer === null){
			self._shiftSelection( idx );
			}else{
			self._appendingShiftSelection( idx );
			}
		}
	
		else if( e.shiftKey && !e.ctrlKey ){
		self._shiftSelection( idx );
		}
	
		else if( e.ctrlKey ) {
			if( self._selection.bSearch( idx ) !== -1 ) {
			self._removeSelection( idx );
			}
	
			else{
			self._addSelection( idx);
			self._selectionPointer = idx;
			}
		self._lastIdx = null;
		}
			
		else if( !e.ctrlKey && !e.shiftKey ) {
			if( self._selection.bSearch( idx ) > -1 ) {
			self._selectionPointer = idx;
			return true;
			}
		self._resetPointers();
		self._selection = [];
		self._addSelection( idx );
		}
	});
}

Selectable.Includes({
	_shiftSelection: function( idx ){
	var j;
	this._selectionPointer = null;
		if( !this._lastStart ){
		this._lastEnd = this._selection[this._selection.length - 1];
		this._lastStart = this._selection[0];
		}
	
		if( idx < this._lastStart ){
			if( this._lastIdx === this._lastEnd || this._lastIdx === null){  // user changed this._selection directions to UP
			this._selection = [];
				for( j = idx; j <= this._lastStart; ++j ){
				this._selection.push( j );
				}
			this._render();				  
			this._lastIdx = idx;
			this._selectionPointer = idx;
			this._lastEnd = this._selection[this._selection.length - 1];
			this._lastStart = this._selection[0];
			}
			else if( this._lastIdx === this._lastStart ){ // user preserved this._selection direction UP
				for( j = idx; j <= this._lastStart; ++j ){
				this._selection.push( j );
				}
			this._selectionPointer = idx;
			this._render();
			}
		}
		else if( idx > this._lastEnd ){
			if( this._lastIdx === this._lastStart  || this._lastIdx === null ){  // user changed this._selection directions to DOWN
			this._selection = [];
				if( this._lastIdx === null ){
					for( j = this._lastStart; j <= idx; ++j ){
					this._selection.push( j );
					}
				}
				else{
					for( j = this._lastEnd; j <= idx; ++j){
					this._selection.push( j );
					}
				}
			this._render();
			this._lastIdx = idx;
			this._selectionPointer = idx;
			this._lastEnd = this._selection[this._selection.length - 1];
			this._lastStart = this._selection[0];
			}
			else if( this._lastIdx === this._lastEnd ){ // user preserved this._selection direction DOWN
				for( j = this._lastEnd; j <= idx; ++j  ){
				this._selection.push( j );
				}
				this._selectionPointer = idx;
				this._render();
			}
		}
		else if( idx > this._lastStart && idx < this._lastEnd ) {
			if( this._selectionPointer === this._lastEnd ){
				for( j = idx; j <= this._lastEnd; ++j ) {
				this._selection.push( j );
				}
			this._selectionPointer = idx;
			this._render();
			}
			else if( this._selectionPointer === this._lastStart ){
				for( j = this._lastStart; j <= idx; ++j ){
				this._selection.push(j);
				}
			this._selectionPointer = idx;
			this._render();
			}
		}
	},
	_appendingShiftSelection: function( idx ) {
	var j, start = this._selection[0], end = this._selection[this._selection.length - 1];
			if( idx < this._selectionPointer ) {
			
				for( j = idx; j <= this._selectionPointer; ++j ) {
				this._selection.push( j );
				}
			
			}
			else if( idx > this._selectionPointer ){
				for( j = this._selectionPointer; j <= idx; ++j){
				this._selection.push( j );
				}
			}
	this._selectionPointer = idx;
	this._render();
	},
	
	_removeSelection: function( idx ) {
	var inarr = this._selection.bSearch( idx );
	this._selection.splice( inarr, 1 );
	this._render();
	},
	
	_addSelection: function( idx ) {
	this._selection.push(idx);
	this._render();
	},
	onscroll: function(){},
	
	prev: function(){
	this._resetPointers();
	var cur;
		if( this._selection.length ) {
		cur = this._selection[0];
		this._selection = [(--cur < 0 ? 0 : cur )];
		}
		else {
		this._selection = [0];
		}
	this._render( true );
	},
	
	next: function(){
	this._resetPointers();
	var cur, l = this._selection.length;
		if( l ) {
		cur = this._selection[l-1];
		this._selection = [(++cur >= this.max ? this.max-1 : cur )];
		}
		else {
		this._selection = [0];
		}
	this._render( false );
	},
	
	_render: function( scroll ) {
	var undef, i, l, all = $( this._selector, this._target );

	$( "."+this._activeClass ).removeClass( this._activeClass );
	this._selection = this._selection.unique();
	this._selection.sort(function(a, b){return (a - b);});
	l = this._selection.length;

		for( i = 0; i < l; ++i) {
		$( all[ this._selection[i] ] ).addClass( this._activeClass );
		}
		
		if( scroll != undef && l ) {
		this.onscroll.call( this, all[ this._selection[0] ], scroll );
		}
	this.onselect.call( this, this._selection );
	},
	
	_resetPointers: function(){
	this._selectionPointer = null;
	this._lastEnd = null;
	this._lastIdx = null;
	this._lastStart = null;	
	},
	
	clearSelection: function(){
	this._resetPointers();
	this._selection = [];
	this._render();
	},
	getSelection: function(){
	return this._selection;
	},
	applyTo: function( arr, callback ) {
	var selection = this._selection;
		if( selection.constructor !== Array ) {
		selection = [selection];
		}
		
	 var r = [], i, l = selection.length, $l;
	 
		if( arr.constructor !== Array ) {
		throw new TypeError( "Expecting Array, instead got " + typeof arr );
		}

		if ( arr.length && l ) {
			
			for( i = 0; i < l; ++i ) {
			r.push( arr[ selection[i] ] );
			}
				
		$l = r.length;
		callback.call( this, r );
		}	

	return this;
	},
	invert: function( length ){
	var i, selection = this._selection, r = [];
		if( length < 1 ) {
		return this;
		}
		
		for( i = 0; i < length; ++i ) {
			if( selection.bSearch( i ) < 0 ) {
			r.push( i );
			}
		}
	this._selection = r;
	this._render();
	return this;
	},
	onselect: function(){
	
	},
	all: function( length ){
		if( length < 1 ) {
		return this;
		}
	this._selection = [].range(0, length - 1);	
	this._render();
	return this;
	}
});

function SingleSelectable( target, selector, opts ) {
var self = this;
this._target = typeof target == "string" ? document.getElementById( target ) : target;
this._selector = selector;
this._activeClass = opts && opts.activeClass || "select-active";
this._selection = null;

	$( this._target ).delegate( selector, "click", function( e ) {
	var target = e.target, idx = +( this.id.substr( this.id.lastIndexOf("-") + 1 ) );
	
		if( idx !== self._selection ) {
		self._addSelection( idx );
		}
		
	return true;
	});

}

SingleSelectable.Inherits( Selectable ).Includes({
		_addSelection: function( idx ) {
		this._selection = idx;
		this._render();
		},
		clear: function(){
		this._clearSelection();
		},
		_clearSelection: function() {
		this._selection = null;
		this._render();
		},
		_render: function() {
		$( "."+this._activeClass ).removeClass( this._activeClass );
			if( this._selection === null ) {
			return this.onselect.call( this, this._selection );
			}
		var i, l, all = $( this._selector, this._target );
		$( all[this._selection] ).addClass( this._activeClass );
		
		this.onselect.call( this, this._selection );
		}		
}).Destroy( [ "all", "invert", "_removeSelection", "_appendingShiftSelection", "_shiftSelection" ] );

function TraversableSingleSelectable( target, selector, opts ) {
SingleSelectable.call( this, target, selector, opts );
this.length = 0;
this._selection = -1;
}

TraversableSingleSelectable.Inherits( SingleSelectable ).Includes({
	onscroll: function( idx) {},
	reset: function(){
	this._clearSelection();
	this._selection = -1;
	},
	setMax: function( max ) {
	this.length = max;
	},
	next: function(){
		if( !this.length ) {
		return false;
		}
	this._selection++;
		if( this._selection >= this.length ) {
		this._selection = this.length - 1;
		}
	this.onscroll.call( this, this._selection );
	this._render();
	},
	prev: function(){
		if( !this.length ) {
		return false;
		}
	this._selection--;
		if( this._selection < 0 ) {
		this._selection = 0;
		}
	this.onscroll.call( this, this._selection );
	this._render();
	}
});
function DraggableSelection( target, selectable, playlist, itemHeight, selector ) {
var self = this;

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( !target.id ) {
	target.id = "draggable-container-"+(+new Date );
	}
	
this._target = target.id;
this._songList = playlist._hashList;
this._selection = selectable._selection;
this._selectable = selectable;
this._playlist = playlist;
this._proximity = [];
this._selector = selector;
this._itemHeight = itemHeight;
this._nodes = [];
this._posChanged = false;
this._prevTotalOffset = null;
this._listOffset = 0;
this._listHeight = 0;
this._itemHeight = itemHeight;
this._lastCoord = 0;
this._init();
}

DraggableSelection.Includes({
	_mouseup: $.noop,
	_trigger: $.noop,
	_createMouseRelease: function(){
	var self = this;
		return function(){
			$( "#"+self._target ).unbind( "scroll", self._trigger );
			$( document ).unbind( "mousemove", self._trigger ).unbind("mouseup", self._mouseup);
			self._prevTotalOffset = null;
				if( self._posChanged ) {
				self._posChanged = false;
				self._playlist.render();
				}
		};
	},
	_createTriggerer: function(){
	var self = this;
		return function(e){
		$( "#"+self._target).trigger( "moving", [e] );
		};
	},
	_init: function(){
	var self = this;
	this._trigger = this._createTriggerer();
	this._mouseup = this._createMouseRelease();
		$("#"+this._target).bind( "selectstart", 
			function(){
			return false;
			}
		).delegate( this._selector, "mousedown",
			function( evt ) {
			var parent;
				if( evt.which !== 1 ) {
				return true;
				}
			parent = document.getElementById( self._target );	
			self._listOffset = parent.offsetTop;
			self._listHeight = parent.offsetHeight;
			self._proximity = self._selectable._selection.mapProximity();
			self._nodes = $( self._selector ).toArray();
			$( parent ).bind("scroll", self._trigger );
			$( document ).bind("mousemove", self._trigger ).bind( "mouseup", self._mouseup );
			}
		).bind( "moving",
			function( evt, evtreal ) {
			var undef;
				if( evtreal.pageY === undef ) {
				evtreal.pageY = self._lastCoord;
				}
				else {
				self._lastCoord = evtreal.pageY;
				}
			var coordsY = evtreal.pageY, curTotalOffset = coordsY + this.scrollTop,
				direction, treshold, selection = self._selectable._selection, target,
				lastSong = self._playlist._hashList.length - 1, prevTotalOffset = self._prevTotalOffset,
				listOffset = self._listOffset, listHeight = self._listHeight, itemHeight = self._itemHeight;

				if( prevTotalOffset == null || prevTotalOffset === curTotalOffset) {
				self._prevTotalOffset = curTotalOffset;
				return true;
				}

			coordsY = coordsY - listOffset > listHeight ? listHeight + listOffset : coordsY;
			coordsY = coordsY - listOffset < 0 ? listOffset : coordsY;
			direction = curTotalOffset > prevTotalOffset ? "down" : "up";

			treshold = ( ( prevTotalOffset - listOffset ) / itemHeight ) >> 0;
			self._prevTotalOffset = curTotalOffset;
			target = ( ( curTotalOffset - listOffset ) / itemHeight ) >> 0;

				if( target !== treshold ) {

					if( 	( selection.bSearch( 0 ) > -1 && direction == "up" ) ||
						( selection.bSearch( lastSong ) > -1 && direction === "down" ) ){
					return true;
					}

				self._multiSwap[ direction ].call( self, target );
				}
			}
		);	
	},
	_multiSwap: {
			up : function( calledTarget ){
			var pMap = this._proximity, selection = this._selectable._selection,
				$l = pMap.length, $$l = selection.length - 1, returned, target, l, copy = [],
				firsthead = null, j, copyhead = pMap[0][0];
				
			var storetarget = calledTarget >= selection[0] ? selection[0] - 1 : calledTarget;
				for(j = 0; j < $l; ++j){
					if(firsthead !== null){
					target = pMap[j][0] - ( firsthead - storetarget );
					}
					else {
					target = storetarget;
					firsthead = copyhead;
					}
				
				returned = this._swapByMap.up.call( this, target, pMap[j] );
				copy.push.apply( copy, returned );
				pMap[j] = returned;
				}
			this._selectable._selection = this._selection = copy && copy.length ? copy : selection;
			this._posChanged = true;
			},
			
			down : function( calledTarget ){
			var pMap = this._proximity, selection = this._selectable._selection,
				$l = pMap.length, $$l = selection.length - 1,
				returned, target, l = pMap[$l-1].length - 1, copy = [],
				firsthead = null, j;
			var storetarget = calledTarget <= selection[$$l] ? selection[$$l] + 1 : calledTarget;
			var z, copyhead = pMap[$l-1][l];
				for( j = $l-1; j >= 0; --j ){
				z = pMap[j].length - 1;
					if(firsthead !== null){
					target = storetarget - firsthead + pMap[j][z];
					}else{
					target = storetarget;
					firsthead = copyhead;
					}
				returned = this._swapByMap.down.call( this, target, pMap[j]);
				copy.push.apply( copy, returned );
				pMap[j] = returned;
				}
			copy.sort(function(a, b){return (a - b);});
			this._selectable._selection = this._selection = copy && copy.length ? copy : selection;
			this._posChanged = true;
			}
	},
	_swapByMap: {
		up: function( target, proxArr ) {
		var head, tail, dif, mapChanges = [], ret = [],
			changeLog = [[],[]], str, itemHeight = this._itemHeight,
			$l = proxArr.length, l = $l - 1, i, nodes = this._nodes, node, nodeFC;
		
		head = proxArr[l];
		tail = proxArr[0];
		dif = tail - target;
		
				for( i = target; i <= head; ++i ) {
				node = nodes[i];
				nodeFC = node.firstChild;
					if( i < tail ) {
					str = i+$l+1;
					changeLog[0].push( i );
					changeLog[1].push( i + $l );
					node.style.top = ( ( i + $l ) * itemHeight ) + "px";
					nodeFC.id = "app-song-" + ( i + $l );
					}
					else if( i >= tail ){
					mathtostring = i-dif+1;
					changeLog[0].push( i );
					changeLog[1].push( i - dif );
					node.style.top = ( ( i - dif ) * itemHeight ) + "px";
					nodeFC.id = "app-song-" + ( i - dif );
					mapChanges.push( i );
					ret.push( i - dif );
					}
				}

		this._nodes.targetMapSwap( target, mapChanges );
		this._songList.targetMapSwap( target, mapChanges );
		return ret;		
		
		},
		down: function( target, proxArr ) {
		var trackAmount = this._songList.length - 1, $l = proxArr.length,
			l = $l - 1, head = proxArr[l], tail = proxArr[0],
			dif, mapChanges = [], ret = [],
			changeLog = [[],[]], i, node, nodeFC, nodes = this._nodes,
			itemHeight = this._itemHeight;
		
		target = target >= trackAmount ? trackAmount : target;
		dif = target - head;
			for( i = tail; i <= target; ++i ) {
			node = nodes[i];
			nodeFC = node.firstChild;
				if( i <= head ) {
				node.style.top = ( ( dif + i ) * itemHeight ) + "px";
				nodeFC.id = "app-song-" + ( dif + i );
				changeLog[0].push( i );
				changeLog[1].push( i + dif );
				mapChanges.push( i );
				ret.push( i + dif );
				}
				else if( i > head ){
				changeLog[0].push( i );
				changeLog[1].push( i - $l );
				node.style.top = ( ( i - $l ) * itemHeight ) + "px";
				nodeFC.id = "app-song-" + ( i - $l );
				}
			}

		this._nodes.targetMapSwap( target, mapChanges );
		this._songList.targetMapSwap( target, mapChanges );
		return ret;
		
		
		}
	}
	
});

function SongDisplay( target, opts ) {
var parent;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-app-song-display";
	}

parent = target.parentNode;
	
	if( !parent || !target ) {
	throw new TypeError( "SongDisplay needs a scroll parent and a content target" );
	return false;
	}
	
	if( parent && !parent.id ) {
	parent.id = ( +new Date ) + "-app-song-display-parent";
	}

this._target = target.id;
this._scrollParent = parent.id ;
this._marqDelay = opts && opts.delay || 2.5;
this._speed = opts && opts.speed || 10;

this._marqDelay *= 1000;
this._speed = ( 1000 / this._speed ) >> 0;
this._marqTimerId = 0;
this._amounts = 0;
this._direction = "right";
this._scrollWidth = 0;
}

SongDisplay.Includes({
	newTitle: function( titleName ) {
	document.getElementById( this._target ).innerHTML = titleName;
	document.title = titleName;
	return this;
	},
	__marquer: function(){
	var target = document.getElementById( this._scrollParent ), self = this,
		progress = this._direction == "right" ? 1 : -1;
	
		this._marqTimerId = window.setInterval( function(){
		self._amounts += progress;
		target.scrollLeft = self._amounts;
			if( self._amounts > self._scrollWidth || self._amounts < 0 ) {
			self._direction = self._amounts < 0 ? "right" : "left";
			window.clearInterval( self._marqTimerId );
			window.setTimeout( function(){self.beginMarquee();}, self._marqDelay );
			}
		}, this._speed );
	return this;
	},
	beginMarquee: function() {
	var scrollParent = document.getElementById( this._scrollParent ),
		sWidth = scrollParent.scrollWidth,
		oWidth = scrollParent.offsetWidth;
	
		if( sWidth - oWidth < 1 ) {
		return this;
		}
		
	this._scrollWidth = sWidth - oWidth;
	window.clearInterval ( this._marqTimerId );
	return this.__marquer();
	},
	stopMarquee: function(){
	window.clearInterval ( this._marqTimerId );
	return this;
	}
});

function InputPlaceholder( target, opts ) {

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-placeholder";
	}

this._target = target.id;	
this._text = opts && opts.text || "";
this._style = opts && opts.style || {color: "#bbbbbb"};
this.__bind();
}

InputPlaceholder.Includes( {
	__bind: function(){
	var elm = $( document.getElementById( this._target ) ), elv = elm[0], self = this;
	
		elm.bind( "focus blur", function( e ) {
			if( e.type == "focus" ) {
			self.__removePlaceHolder( this );
			}
			else {
			self.__setPlaceHolder( this );
			}
		});
		
	
	this.__setPlaceHolder( elv );	
	},
	__removePlaceHolder: function( elm ) {
	
		if( elm.value != this._text ) {
		return true;
		}
	
	var key, styles = this._style;
	elm.value = "";
	
		for( key in styles ) {
		elm.style[ key ] = "";
		}
	},
	__setPlaceHolder: function( elm ){
	
		if( elm.value && elm.value != "" ) {
		return true;
		}
	
	var key, styles = this._style;
	elm.value = this._text;
			
		for( key in styles ) {
		elm.style[ key ] = styles[ key ];
		}
	}
	
});

function SearchSuggestions( target, opts ) {
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-suggestcon";
	}
	
this._target = target.id;


this._activeClass = opts && opts.activeClass || "search-suggest-active";
this._suggestClass = opts && opts.suggestClass || ".search-suggest";
this._className = opts && opts.addClass || "search-suggest";
this._suggestAction = opts && opts.suggestAction || function( value, index ){};
this._suggestions = [];
this._hasSuggestions = false;
this._activeSuggestion = -1;
this._init();



}

SearchSuggestions.Includes( {
	onsuggest: $.noop,
	_mouseup: $.noop,
	_mousedown: $.noop,
	_createKeyUp: function(){
	var self = this;
		return  function(e){
		var suggestLength, idvar = self._activeSuggestion;
		
			if( !self._hasSuggestions ) {
			return true;
			}
		
		suggestLength = self._suggestions.length;
		
			if( e.which == 27 ) {
			return self.hide();
			}
	
			else if ( e.which == 13 ) {
	
				if( self._activeSuggestion > -1 ) {
				self._suggestAction.call( self, self._suggestions[ self._activeSuggestion ], self._activeSuggestion  );
				self.hide();
				}
	
			}
			else if( self._browsekeys[ e.which ]  ) {
			$( "." + self._activeClass ).removeClass( self._activeClass );
			idvar += self._browsekeys[ e.which ];
			idvar = idvar > suggestLength - 1 ? 0 : idvar;
			idvar = idvar < 0 ? suggestLength - 1 : idvar;
			self._activeSuggestion = idvar;
			$( "#suggestion-"+idvar).addClass( self._activeClass );
	
			}
		};
	},
	_createMouseUp: function(){
	var self = this;
		return function(e){
			if( e.which !== 1 ) {
			return true;
			}
		self.hide();
		}
	},
	_init: function(){
	var self = this;
	
	this._mouseup = this._createMouseUp();
	this._keyup = this._createKeyUp();
	
		$( "#"+this._target ).delegate( this._suggestClass, "mousedown", function(e){
		
		var id = this.id, index = +( id.substr( id.lastIndexOf( "-" ) + 1 ) );
		
			if( e.which === 1 ) {
			self.hide();
			self._suggestAction.call( self, self._suggestions[ index ], index  );
			}
		
		}).hide();	
	},
	getActiveSuggestion: function(){
	return this._activeSuggestion > -1 ? this._suggestions[ this._activeSuggestion ] : null;
	},
	
	replaceBold: function( str ){
	return "<b>" + str + "</b>";
	},
	
	_browsekeys: {
		37:-1,
		38:-1,
		39:1,
		40:1
	},
	
	newSuggestions: function( arr, query ) {
	this.hide();
	var i, l = arr.length, elm = document.getElementById( this._target ),
		div, txt, frag = document.createDocumentFragment(), matchAgainst, str;
	this._suggestions = arr;
	
		if( !l ) {
		return;
		}
		
	$( document ).bind( "mouseup", this._mouseup ).bind( "keyup", this._keyup );
	matchAgainst = new RegExp("(" + query.split(" ").join("|") + ")", "gi");
		
		for( i = 0; i < l; ++i ) {
		div = document.createElement("div");
		div.id = "suggestion-"+i;
		div.className = this._className;
		div.innerHTML = arr[i].replace( matchAgainst, this.replaceBold );
		frag.appendChild( div );
		}
	elm.appendChild( frag );
	elm.style.display = "block";
	this.onsuggest.call( this, elm );
	this._hasSuggestions = true;	
	return this;
	},
	hide: function(){
	this._activeSuggestion = -1;
	this._hasSuggestions = false;
	$( "#"+this._target ).empty().hide();
	$( document ).unbind( "mouseup", this._mouseup ).unbind( "keyup", this._keyup );
	return this;
	}
	
});

function YouTubeSuggestions( target, opts ) {
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-suggestcon";
	}
	
this._target = target.id;
this._throttle = opts && opts.throttle || 300;
this._handler = opts && opts.handler || function(){};

$( "#"+this._target ).bind("keyup", throttle( function(e){
	if( e.which < 42 ){
	return true;
	}
self.__jsonp.call(self, this.value);

}, this._throttle ));
	


}

YouTubeSuggestions.Includes({
	__jsonp: function( val ) {
	
	var self = this, jsonp = new JSONP( "http://suggestqueries.google.com/complete/search", { 
			callbackP: "jsonp",

			timeout: 30,

			callback: function(resp) {
			self._handler.call( self, resp );
			},

			params: {
				hl: "en",
				ds: "yt",
				json: "t",
				q: val
			}
		});
	jsonp.execute();
	}

});



function Search( target, opts ){
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-searchcon";
	}

this._target = target.id;
this._searchTypes = {};
this._className = opts && opts.addClass || "search-result";
this._results = [];
this._searching = false;
}

Search.Includes({
	getContainer: function(){
	return this._results;
	},
	onsearchresults: $.noop,
	onbeforesearch: $.noop,
	onaftersearch: $.noop,
	addType: function( name, fn, callback ) {
	this._searchTypes[ name ] = fn;
	return this;
	},
	search: function( type, query, nohistory ) {
		if( this._searching == true ) {
		return this;
		}
	$( "#"+this._target).empty();
	this._results = [];
	this.onbeforesearch( query, type );
	this._searching = true;
		if( typeof this._searchTypes[ type ] != "function" ){
		return this;
		}
	this._searchTypes[ type ].call( this, query );
	},
	addResults: function( arr, query, type ) {
	this.onaftersearch( query, type, arr.length );
	this._searching = false;
	var i, l = arr.length;

		if( !l) {
		return this;
		}
	
	this._results = arr;
	this.onsearchresults.call( this, arr, query );
	return this;
	}


});

function ClientsideSearcher( arr, prop ) {
this._searchFrom = arr;
this._matchProperty = prop || null;
this._results = [];
}

ClientsideSearcher.Includes({
	onbeforesearch: function(){},
	onaftersearch: function( res ){},
	getResultByIndex: function( idx ){
		if( idx >= this._results.length ) {
		return null;
		}
	return this._results[idx];
	},
	search: function( query ) {
	this._results = [];
	this.onbeforesearch.call( this );
	var i, l = this._searchFrom.length, prop = this._matchProperty,
		arr = this._searchFrom, query = query.split(" "),
		$l = query.length, reg = "", elm;
		
		for( i = 0; i < $l; ++i ) {
			if( query[i] ) {
			reg += "(?=.*" + query[i] + ")";
			}
		}
		
	reg = new RegExp ( reg, "i" );
	
		for( i = 0; i < l; ++i ) {
		elm = arr[i];
			if( reg.test( elm[prop] ) ) {
			this._results.push( elm );
			}
		}
	this.onaftersearch.call( this, this._results );
	}


});

function History( max ){
this._container = [];
this._ignore = false;
this._max = max || 50;

}

History.Includes({
	ignore: function(){
	this._ignore = true;
	},
	onnewentry: function( entries, addedEntries ){},
	onremoveentry: function( entries, removedEntries ){},
	add: function( entries ){
	
		if( this._ignore ) {
		this._ignore = false;
		return this;
		}
	
	var arr = this._container;
		if( entries.constructor !== Array ) {
		entries = [entries];
		}
	arr.push.apply( arr, entries );
	this.onnewentry.call( this, arr, entries );
	
		if( arr.length > this._max ) {
		this.remove( "first" );
		}
	
	return this;
	},
	remove: function( indices ){
	var i, l, entry, entries = this._container, $l = entries.length - 1, rem = [], offset = 0;
		if( indices == "last" ){
		indices = [ $l ];
		}
		else if( indices == "first" ) {
		indices = [ 0 ];
		}
		else if( indices.constructor !== Array ) {
		indices = [ indices ];
		}
		
	l = indices.length;
	
		for( i = 0; i < l; ++i ) {
		entry = indices[ i ] - offset;
			if( entry < 0 || entry > $l ) {
			continue;
			}
			
		rem.push( entries.splice( entry, 1 ) );
		offset++;
		$l--;
		}
	this.onremoveentry.call( this, entries, rem );
	return this;
	}
});


// Filter, playlist, search ja queue tarvii
// My�s. search.play(), playlist.play() on eri
function ActionMenu( target, opts ){
var self = this, c = 0;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-searchcon";
	}

this._target = target.id;
this._name = opts && opts.name || ( +new Date)+"menu";
this._disabledClass = opts && opts.disabledClass || "menu-item-disabled";
this._selector = opts && opts.selector || ".menu-selector";
this._disabled = {};

	$( this._selector, target ).each( function( index ){
	this.id = self._name+"-menu-item-"+index;
	c++;
	});

	$( "#"+this._target).delegate( this._selector, "click", function(e) {
	var id = this.id; 
	
	id = +( id.substr( id.lastIndexOf( "-" ) + 1 ) );
	
		if( self._disabled[ id ] ) {
		return true;
		}
	
	self.onmenuclick.call( self, id );
	});
	
this.length = c;
}

ActionMenu.Includes({
	onmenuclick: function( menuId ){},
	show: function(){
	$( "#"+this._target).show();
	return this;
	},
	hide: function(){
	$( "#"+this._target).hide();
	return this;
	},
	__enableAll: function(){
	var i, l = this.length;
		for( i = 0; i < l; ++i ) {
		$( "#"+this._name+"-menu-item-"+i ).removeClass( this._disabledClass );
		delete this._disabled[ i ];				
		}
	return this;
	},
	__disableAll: function(){
	var i, l = this.length;
		for( i = 0; i < l; ++i ) {
		$( "#"+this._name+"-menu-item-"+i ).addClass( this._disabledClass );
		this._disabled[ i ] = true;
		}
	return this;
	},
	activate: function( indices ) {
	var i, l = this.length;
	
		if( indices == "all" ){
		return this.__enableAll();
		}
		else if( indices == "none" ){
		return this.__disableAll();
		}
		else if( indices.constructor !== Array ) {
		indices = [indices];
		}
		
	indices = indices.toKeysObj();
		
		for( i = 0; i < l; ++i ) {
			if( i in indices ) {
			$( "#"+this._name+"-menu-item-"+i ).removeClass( this._disabledClass );
			delete this._disabled[ i ];			
			}
			else {
			$( "#"+this._name+"-menu-item-"+i ).addClass( this._disabledClass );
			this._disabled[ i ] = true;
			}
		}
	return this;
	}
});

// TODO: expand to any attribute, not just scroll
function Scrolls( ids ) {
this._scrolls = {};
this.add( ids );
}
Scrolls.Includes({
	calculate: function( id ){
	var key, obj = this._scrolls[id];

		if( !id || !obj ) {
		return this;
		}	

	obj.value = $( obj.selector )[0].scrollTop;
	return this;
	},
	restore: function( id ) {
	var obj = this._scrolls[id];
		if( !id || !obj ) {
		return this;
		}
	$( obj.selector )[0].scrollTop = obj.value;
	return this;
	},
	add: function( ids ) {
	var key;
		for( key in ids ) {
		this._scrolls[key] = {"selector": ids[key], value: 0};
		}	
	}
});

function Popup( width, height, opts ) {
var self = this;
this._idBase = +(new Date);
this._popups = {};
this._lastAdd = null;
this.length = 0;
this._width = width;
this._height = height;
this._stacks = opts && !!opts.stacks || true;
this._stackOffsetX = opts && opts.stackOffsetX || 15;
this._stackOffsetY = opts && opts.stackOffsetY || 15;
this._closer = opts && opts.closer || ".popup-closer-class";
this._closeEvents = {};
	$(window).bind( "resize", function(){
	var key, popups = self._popups, left,
		top, width, height, winWidth = $(window).width(),
		winHeight = $(window).height(), popup, offset, id;
	
		for( key in popups ) {
		
		popup = document.getElementById( key );
		width = parseInt( popup.style.width, 10 );
		height = parseInt( popup.style.height, 10 );
		offset = popups[key].offset;
		left = ( ( ( winWidth - width ) / 2 ) >> 0 ) + offset * self._stackOffsetX;
		top = ( ( ( winHeight - height ) / 2 ) >> 0 ) + offset * self._stackOffsetY;
		left = left < 0 ? 0 : left;
		top = top < 0 ? 0 : top;
		popup.style.left = left + "px";
		popup.style.top = top + "px";		
		}	
	});
	
	$( document ).delegate( this._closer, "click" , function(){
	self.close.call( self, this );
	});

this._className = opts && opts.addClass || "popup-main";
}

Popup.Includes({
	onclose: function(){},
	onbeforeopen: function( id ){return 0;},
	onopen: function(){},
	closeEvent: function( fn, id ){
	id = id || this._lastAdd;
	this._closeEvents[id] = fn;
	},
	closeAll: function(){
		if( !this.length ){
		return false;
		}
	var key, popups = this._popups;
		for( key in popups ) {
		$("#"+key ).remove();
		}
	this._popups = {};
	this._lastAdd = null;
	this.length = 0;
		for( key in this._closeEvents ) {
		this._closeEvents[key]();
		delete this._closeEvents[key];
		}
	this.onclose.call( this );
	return this;
	},
	close: function( elm ) {

	var node = elm, popup, className = this._className, popups = this._popups,
		l = popups.length, id, obj;
		if( !elm && this._lastAdd !== null ) {
		node = $( "#"+( this._lastAdd ) );

		delete popups[ this._lastAdd ];
		$( node ).remove();
		this.length--;
			if( typeof this._closeEvents[this._lastAdd] == "function" ) {
			this._closeEvents[this._lastAdd]();
			delete this._closeEvents[this._lastAdd];
			}
		this.onclose.call( this );
		
		}
		else {
			while( node ) {

				if( (" "+node.className+" " ).indexOf( className ) > -1 ) {
				popup = node;
				break;
				}
			node = node.parentNode;
			}

			if( popup && popups[popup.id] ) {
			
			$(popup).remove();
			delete popups[popup.id];
			this.length--;
				if( typeof this._closeEvents[popup.id] == "function" ) {
				this._closeEvents[popup.id]();
				delete this._closeEvents[popup.id];
				}
			this.onclose.call( this );
			}
		}
		
		if( !this.length ) {
		this._lastAdd = null;
		}
		else {
		this._lastAdd = $( "."+this._className ).last()[0].id;
		}
	return this;
	},
	open: function( html, width, height ) {
	var div = document.createElement( "div"), id, top, left,
		winWidth = $(window).width(), winHeight = $(window).height(),
		width = width || this._width, height = height || this._height,
		offset = this._stacks ? this.length : 0, closerDiv = document.createElement("div"),
		contentDelay, self = this, $div;
	
	id = "popup-"+ ( ++this._idBase );
	left = ( ( ( winWidth - width ) / 2 ) >> 0 ) + offset * this._stackOffsetX;
	top = ( ( ( winHeight - height ) / 2 ) >> 0 ) + offset * this._stackOffsetY;
	left = left < 0 ? 0 : left;
	top = top < 0 ? 0 : top;
	div.id = id;
	closerDiv.className = this._closer.substr(1);
	div.appendChild( closerDiv );
	div.className = this._className;
	div.setAttribute( "style", "width:"+width+"px;height:"+height+"px;position:absolute;top:"+top+"px;left:"+left+"px;z-index:"+(100000+offset)+";display:block;" );
	$div = $( div );
	$div.appendTo( "body" );
	this.onbeforeopen.call( this, id );
	this._popups[id] = { width: width, height: height, offset: offset};
	this._lastAdd = id;
	this.length++;
	$div.append( html );
	this.onopen.call( self );
	return this;
	},
	html: function( html, elm ) {
	elm = elm || ( this._lastAdd && document.getElementById( this._lastAdd ) );
		if( !elm ) {
		return null;
		}
	elm.innerHTML = html;
	return elm;
	}
});

function BlockingPopup(){
Popup.apply( this, Array.prototype.slice.call( arguments, 0) );
this._blockerId = "blocker-"+(+new Date);
}

BlockingPopup.Inherits( Popup ).Includes({
	closeAll: function(){
		if( !this.__super__( "closeAll" ) ) {
		return false;
		}
	$( "#"+this._blockerId).remove();
	return this;
	},
	open: function( html, width, height ){
	this.__super__( "open", html, width, height );
	
		if( this.length < 2 ) {
		$("<div id=\""+this._blockerId+"\"style=\"background-color:transparent;position:absolute;" +
			"top:0px;left:0px;z-index:99999;display:block;width:"+$(window).width()+"px;" +
			"height:"+$(window).height()+"px;\"></div>").prependTo( "body" );
		}
	return this;
	},
	close: function( elm ){
	this.__super__( "close", elm );
		if( !this.length ) {
		$( "#"+this._blockerId).remove();
		}
	return this;
	}
});

function Table( appendTo, nodecache, opts ) {
var table = document.createElement( "table" ), i, th, data, headers, classPrefix,
	frag = document.createDocumentFragment(),
	tbody = document.createElement( "tbody" ),
	thead = document.createElement( "thead" ),
	tr = document.createElement( "tr" );
	if( typeof appendTo == "string" )
	appendTo = document.getElementById( appendTo );

	if( appendTo == null)
	return {};

headers = opts && opts.captions || {};
this._nodecache = nodecache;
this._naText = opts && opts.naText || "N/A";
this._id = "dyn__table__" + ( Table.tid++ );
this._className = classPrefix = opts && opts.classPrefix || "class-default";
this._names = [];
this.length = 0;
table.id = this._id;
table.className = classPrefix + "-table";
thead.className = classPrefix + "-thead";
tbody.className = classPrefix + "-tbody";
tr.className = classPrefix + "-thead-tr";

	for( i in headers ) {
	this._names.push( i );
	th = document.createElement("th");
	data = nodecache._getData.call( nodecache, th );	
	data.headerName = i;
	th.innerHTML = headers[i];
	tr.appendChild( th );
	}

thead.appendChild( tr );
table.appendChild( thead );
table.appendChild( tbody );
frag.appendChild( table );

appendTo.appendChild( frag );
}

Table.Includes({
	STATIC__SliceHTML: typeof document.getElementById == "function" ?
			Array.prototype.slice :
			function(min, max){
			var len = this.length, i, max = max || len-1, r = [], min = min || 0;
				for( i = min; i <= max; ++i )
				r.push( this[i] );
			return r;
			},

	STATIC__tid: 0,

	length: 0,

	getHeaderName: function( elem ) {
	var data = this._nodecache._getData( elem );
	return data.headerName || null;
	},
	getRowData: function( elem, column ) {
	var r, data;
		if ( elem && elem.nodeName && elem.nodeName.toLowerCase() != "tr" ) {
		elem = elem.parentNode;

			while( elem != null ) {
				if( elem.nodeName.toLowerCase() == "tr" ) {
				break;
				}
			elem = elem.parentNode;
			}


		}

	data = this._nodecache._getData( elem );
	r = column ? data.rowdata && data.rowdata[column] : data.rowdata;

		if( +r ) {
		return parseFloat(r);
		}
	return r;
	},
	getElement: function( type, nth ){
	var elem = document.getElementById( this._id );

		if( elem == null )
		return null;

		if( 	type == "tbody" ||
			type == "thead" )
		return elem.getElementsByTagName( type )[0];

		else if ( type == "tr" ) {
		
			if( !isNaN( nth ) )
			return elem.getElementsByTagName( "tbody")[0].getElementsByTagName("tr")[nth];

			else
			return Table.SliceHTML.call( elem.getElementsByTagName( "tbody")[0].getElementsByTagName("tr"), 0 );	
		}
		else if ( type == "th" ) {
			if( !isNaN( nth ) )
			return elem.getElementsByTagName( "thead")[0].getElementsByTagName("th")[nth];

			else
			return Table.SliceHTML.call( elem.getElementsByTagName( "thead")[0].getElementsByTagName("th"), 0 );	
		}

	return elem;
	},
	
	removeRow: function( elem ) {
		if( elem instanceof Array ) {

			for( i = 0, l = elem.length; i < l; ++i ) {
			this.removeRow( elem[i] );
			} 
		}
		else if( typeof elem == "number" ) {
		elem = this.getElement( "tr", elem );
		}

		if( elem == null )
		return this;

	this.length--;
	this._nodecache._removeData( elem );
	elem.parentNode.removeChild( elem );
	return this;
	},

	addData: function( opts, cb ) {
	var i, l, tr, data, frag = document.createDocumentFragment();
		if( opts.constructor !== Array ) {
		opts = [opts]
		}

		if( !this._names.length ) 
		return this;

		for( i = 0, l = opts.length; i < l; ++i ) {
		tr = this._generateRow( opts[i], cb  );
		tr.id = this._className + "-" +this.length;
		data = this._nodecache._getData( tr );
		data.nth = this.length;
		data.rowdata = opts[i];
		frag.appendChild ( tr );
		this.length++;
		}
		
	this.getElement("tbody").appendChild( frag );
	return this;
	},

	_generateRow: function( rowdata, cb ) {
	var tablerow = document.createElement( "tr" ), html = "", td, classPrefix = this._className, names = this._names;

	tablerow.className = classPrefix + "-tbody-tr";
		for( i = 0, l = names.length; i < l; ++i ) {
		td = document.createElement( "td" );
		td.className = classPrefix + "-tbody-td";
		k = names[i];
			if( cb && typeof cb[k] == "function" ) {
			td.innerHTML = cb[k].call( this, rowdata );
			}
			else {
			td.innerHTML = rowdata[k] != null ? rowdata[k] : this._naText;
			}
		tablerow.appendChild( td );
		}
	return tablerow;
	},

	destroy: function() {
	var ref = document.getElementById( this._id );
		if( ref == null )
		return this;
	this.length = 0;
	this._names = [];
	this._nodecache._purgeCache();
	ref.parentNode.removeChild( ref );
	return this;
	}


});

function Storage( stringify, parse) {
	var undef;
	var hasLocalStorage = "localStorage" in window,
		__set, __get, __remove;
		

	stringify = stringify || window.JSON.stringify;
	parse = parse || window.JSON.parse;
	
	var __toString = function( obj ) {
	return typeof obj == "string" ? obj : stringify( obj );
	},
	
	__toObj = function( str ) {
	var r;
		try {
		r = parse( str );
		}
		catch(e){
		return str;
		}
	return r;
	};
	
		if( hasLocalStorage ) {
			__set = function( name, value ) {
			window.localStorage.setItem( name, value );
			};

			__get = function( name ) {
			return window.localStorage.getItem( name );
			};

			__remove = function( name ) {
			return window.localStorage.removeItem( name );
			};
		}
		else {
			__set = function( name, value, exp ) {
			exp = exp || 1;
			var date = new Date();
			date.setTime( +date + ( exp * 31536000000 ) );
			document.cookie = name + "=" + value + "; expires=" + date.toGMTString() + "; path=/";
			};

			__get = function( name ) {
			var cookies = document.cookie.split( ";" ),
				cookieN, i, l = cookies.length, key = name + "=";
				
				for( i = 0; i < l; ++i ) {
				cookieN = cookies[i];
					while ( cookieN.charAt( 0 ) == " " ) {
					cookieN = cookieN.substring( 1, cookieN.length );
					}
					
					if( cookieN.indexOf( key ) === 0 ) {
					return cookieN.substring( key.length, cookieN.length );
					}
				
				}
			return null;
			};

			__remove = function( name ) {
			return __set( name, "", -1 );
			};		
		}

	return {
		"update": function( obj, name, value ){
		var objk = __toObj( __get( obj ) ), upd;
			if( !objk ) {
			var upd = {};
			upd[name] = value;
			return this.set( obj, __toString( upd ) );
			}
		objk[name] = value;
		return this.set( obj, __toString( objk ) );
		},
		"get": function( name ) {
		return __toObj( __get( name ) );
		},
		"set": function( name, value ) {
		var key;
			if( typeof name == "object" ) {

				for( key in name ) {
				value = name[key];
				__set( key, __toString( name[key] ) );
				}
			}
			else {
			__set( name, __toString( value ) );
			}
			
		return this;
		},
		"remove": function( name ) {
		return __remove( name );
		}

	};
}

function Loader( identifier, storage, jsonparser ) {
this._validNames = /[\/:*?"<>|\s]/g;
this._storage = storage;
this._identifier = identifier.replace( this._validNames, "" );
this._jsonparser = jsonparser || window.JSON.parse;
}

Loader.Includes({
	list: function(){
	var r = [], key, data = this._storage.get( this._identifier );
	
		if( data ) {
			for( key in data ) {
			r.push({name: key, length: data[key].length});
			}
		}
	return r;
	},
	"import": function( file ) {
	var loadobj = {error: "FileReader not supported by browser", name: ( file && file.name || "default" ), data: ""}, reader, self = this;
	
		if( !( "FileReader" in window ) ) {
		this.onload.call( this, loadobj );
		return this;
		}
	reader = new window.FileReader();
	
		reader.onloadend = function(e){

			try {
			loadobj.data = self._jsonparser( e.target.result );			
			}
			catch(e) {
			loadobj.data = {};
			}
		delete loadobj.error;
		self.onload.call( self, loadobj );
		};
	
	reader.readAsText( file );
	return this;
	},
	load: function( name ) {
	var data, loadobj = {error: "Can't find playlist named " +name, name: name, data: ""};
	
	var data = this._storage.get( this._identifier );
	
		if( !name || !data || !data[name] ) {
		this.onload.call( this, loadobj );
		return this;
		}
		
	delete loadobj.error;
	loadobj.data = data[name];
	this.onload.call( this, loadobj );
	return this;
	},
	onload: function( loadobj ){}

});

function Saver( identifier, storage, opts ){
this._validNames = /[\/:*?"<>|\s]/g;
this._storage = storage;
this._identifier = identifier.replace( this._validNames, "" );
this._exportURL = opts && opts.exportURL || null;
this._jsonstringify = opts && opts.jsonstringify || window.JSON.stringify;
}

Saver.Includes({
	onexport: function( response ) {},
	"export": function( name, data ) {
		if( this._exportURL == null ) {
		this.onexport.call( this, {error: true} );
		return this;
		}
	var self = this;
	
		if( !data ) {
		return this;
		}
	
		$.ajax({
		"data": {"filename": name, "data": self._jsonstringify( data ) },
		"datatype": "json",
		"type": "POST",
		"url": this._exportURL,
			"success": function( obj ) {
			self.onexport.call( self, obj );
			},
			"error": function() {
			self.onexport.call( self, {error: "Communication failed with server, try again later"} );
			}
		});
	
	},
	onsave: function( obj ){},
	onoverwrite: function( obj ){},
	save: function( name, json ){
	saveobj = {error: "Invalid Name", name: name, data: json};
		if( !name ) {
		this.onsave.call( this, saveobj );
		return this;
		}
		
	name = name.replace( this._validNames, "" );
	var data = this._storage.get( this._identifier );
	
		if( data != null && name in data && this.onoverwrite.call( this, saveobj ) === false ) {
		saveobj.error = "Overwrite denied";
		this.onsave.call( this, saveobj );
		return this;
		}
		
	data = data || {};
	data[name] = json;
	this._storage.set( this._identifier, data );
	delete saveobj.error;
	this.onsave.call( this, saveobj );
	return this;
	}
});

function FlyingMessage( target, opts ){
var $target = target;

target = ( target.nodeName && ( target.id || ( target.id = "fly-through-"+( +new Date ) ) ) && target.id ) || target;
this._removeAfter = opts && opts.removeAfter || 5000;
this._from = "left";
this._animateFor = opts && opts.animateFor || 300;
this._ifTaken = opts && opts.ifTaken || "remove";
this._curMsgId = "";
this._flying = [];
this._target = target;
this._curTimer = 0;
}

FlyingMessage.Includes({
	onafter: function( elem ){
	},
	createMsg: function( msg, className, from ){
	var id = "fly-through-span"+(+new Date ),
		span = document.createElement("span"), width,
		parWidth, startWidth, endWidth, target = document.getElementById( this._target ), self = this,
		from = from || this._from || "left", animate;
		
		if( target == null ) {
		return this;
		}
		
		if( this._flying.length ) {
		
			switch( this._ifTaken ) {
			case "cancel":
			return this;
			case "remove":
			window.clearTimeout( self._curTimer );
			$( document.getElementById( this._flying.pop() ) ).stop( true, false ).remove();
			break;
			case "nothing":
			break;
			
			default:
			window.clearTimeout( self._curTimer );
			$( document.getElementById( this._flying.pop() ) ).stop( true, false ).remove();
			}
		}
	span.className = className || "";
	span.appendChild( document.createTextNode( msg ) );
	span.style.visibility = "hidden";
	document.body.appendChild( span );
	width = span.offsetWidth;
	parWidth = target.offsetWidth;
	document.body.removeChild( span );
	span.style.visibility = "";
	span.style.position = "absolute";
	span.style[from] = "-100000px";
	endWidth = parWidth / 2 - width / 2;
	startWidth = 0 - width - 25;
	span.id = id;
	this._flying.push( id );
	
	animate = (function(endWidth){var r = {}; r[from] = endWidth+"px"; return r;})(endWidth);
		
		$( span ).css( from, ( ""+startWidth )+"px" ).appendTo( target ).animate(
			animate,
			this._animateFor,
			function() {
			var $this = this;
			self._curTimer=	window.setTimeout( function(){
				self.onafter.call( self, $this.parentNode.removeChild( $this ) );
				self._flying.pop();
				
				}, self._removeAfter );
			}
		);

	return this;
	}
});

$.fn.removeFiles = function(){
	return this.each( function(){
	var key, atts, hover,
		input = document.createElement("input"),
		self = $(this), obj, kk, stylestr = "",
		width = this.offsetWidth, height = this.offsetHeight, jqInput;
		
	atts = self.data( "atts" );
	hoverClass = self.data( "hoverClass" );
	
		for( key in atts ) {
			if( key == "style" ) {
			obj = atts[key];
				for( kk in obj ) {
				stylestr += ( kk +":"+obj[kk]+";" );			
				}
			continue;
			}
		input[key] = atts[key];
		}
		
	input["type"] = "file";
	input.setAttribute("style", "position:absolute;top:0px;left:0px;width:"+width +
			"px;height:"+height+"px;z-index:100000;opacity:0;-moz-opacity:0;" +
		"filter: alpha('opacity=0');"+stylestr);
		
	jqInput = $(input);
	jqInput.data( "atts", atts);
	jqInput.data( "hoverClass", hoverClass );
	
		if( hoverClass != null ) {
			jqInput.bind( "mouseover mouseout", function(e){
				if( e.type == "mouseover" ) {
				$(this.previousSibling).addClass( hoverClass );
				}
				else {
				$(this.previousSibling).removeClass( hoverClass );
				}
			});
		}

	this.parentNode.appendChild( input );
	self.remove();
	});
};

$.fn.fileInput = function( atts, hoverClass ){
atts = atts || {};
hoverClass = hoverClass || null;
	return this.each( function(){
	var input = document.createElement("input"), key,
		container = document.createElement("div"),
		width = this.offsetWidth, height = this.offsetHeight, obj, kk, stylestr = "", jqInput,
		$elm = $(this), minWidth = $elm.width(), minHeight = $elm.height(), maxHeight = $elm.outerHeight(true),
		maxWidth = $elm.outerWidth( true );
		
		for( key in atts ) {
			if( key == "style" ) {
			obj = atts[key];
				for( kk in obj ) {
				stylestr += ( kk +":"+obj[kk]+";" );			
				}
			continue;
			}
		input[key] = atts[key];
		}

	container.setAttribute( "style", "position:relative;width:"+maxWidth+"px;height:"+maxHeight+"px" );
	input["type"] = "file";
	input.setAttribute("style", "position:absolute;top:0px;left:0px;width:"+maxWidth +
		"px;height:"+maxHeight+"px;z-index:100000;opacity:0;-moz-opacity:0;" +
		"filter: alpha('opacity=0');"+stylestr);

	jqInput = $(input);
	jqInput.data( "atts", atts);
	jqInput.data( "hoverClass", hoverClass );
	this.style.position = "absolute";
	this.style.left = "0px";
	this.style.top = "0px";
	this.style.zIndex = "1";
	this.style.width = minWidth+"px";
	this.style.height = minHeight+"px";
	this.parentNode.insertBefore( container, this );
	container.appendChild( this.parentNode.removeChild( this ) );
	container.appendChild( input );
	
		if( hoverClass != null ) {
			jqInput.bind( "mouseover mouseout", function(e){
				if( e.type == "mouseover" ) {
				$(this.previousSibling).addClass( hoverClass );
				}
				else {
				$(this.previousSibling).removeClass( hoverClass );
				}
			});
		}
	});
};


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

function Slider( target, opts ){
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = "slider-" + ( +new Date );
	}

this._direction = opts && opts.direction || "horizontal";

	if( this._direction == "vertical" ) {
	this._pageDirection = "pageY";
	this._offsetDirection = "top";
	this._offsetDimension = "offsetHeight";	
	} else {
	this._pageDirection = "pageX";
	this._offsetDirection = "left";
	this._offsetDimension = "offsetWidth";	
	}

this._clickMove = opts && opts.clickMove || true;
this._target = target.id;
this._offset = 0;
this._dimension = 0;
this._init();
}

Slider.Includes({
	__percentage: function( e ) {
	var r = ( e[this._pageDirection] - this._offset ) / this._dimension;
	r = r > 1 ? 1 : r;
	r = r < 0 ? 0 : r;
	return r;
	},
	__createMouseUp: function(){
	var self = this;
		return function(e){
		self.onslideend.call( self, e );
		$(document).unbind( "mousemove", self.__onmousemove ).unbind( "mouseup", self.__onmouseup );
		}
	},
	__createMouseMover: function() {
	var self = this;
		return function(e){
		self.onslide.call( self, self.__percentage( e ) );
		};
	},
	onslidebegin: $.noop,
	onslideend: $.noop,
	onslide: $.noop,
	_init: function(){
	var self = this;
	this.__onmouseup = this.__createMouseUp();
	this.__onmousemove = this.__createMouseMover();
		$( "#"+this._target ).bind( "mousedown",
			function(e){
				if( e.which !== 1 ) {
				return true;
				}
			self._dimension = this[self._offsetDimension];
			self._offset = $(this).offset()[self._offsetDirection];
			self.onslidebegin.call( self, e );
			
				if( self._clickMove ) {
				self.onslide.call( self, self.__percentage( e ) );
				}
				
			$(document).bind( "mousemove", self.__onmousemove ).bind( "mouseup", self.__onmouseup );
			
			}

		);

	}
});

function Player(){
this.__volume = 0;
this.__mutedVolume = 0;
this.__isMuted = false;
}

Player.Includes({
	isMuted: function(){
	return this.__isMuted;
	},
	toggleMute: function(){
	this.__isMuted = this.__isMuted ? false : true;
		if( this.__isMuted ) {
		this.__mutedVolume = this.__volume;
		this.setVolume( 0 );
		return 0;
		}
		else {
		this.setVolume( this.__mutedVolume );
		return this.__volume;
		}
	},
	getVolume: function(){
	return this.__volume;
	},
	setVolume: function( val ) {	
	val = val < 0 ? 0 : val;
	val = val > 100 ? 100 : val;
	this.__volume = val;
	return this;
	}
});

function Tooltip( opts ){
this._defaults = jQuery.extend( {}, this._defaults, opts );
this._currentId = [];
this._idCounter = +new Date;

}

Tooltip.directions = {
	"Left":"Right",
	"Right":"Left",
	"Top":"Bottom",
	"Bottom":"Top"
};



Tooltip.Includes( {
	_applyOffsets: function( elm, direction, size, offset ) {
	
		switch( direction ) {
		case "Left":
		elm.style.left = "-"+size+"px";
		elm.style.top = offset+"px";
		break;
		case "Right":
		elm.style.right = "-"+size+"px";
		elm.style.top = offset+"px";
		break;
		case "Top":
		elm.style.top = "-"+size+"px";
		elm.style.left = offset+"px";
		break;
		case "Bottom":
		elm.style.bottom ="-"+size +"px";
		elm.style.left = offset+"px";
		break;
		}

	return elm;
	},
	_arrowize: function( elm, offset, color, size, direction, borderWidth ) {
	var dir, oppositeDir, opposite, directions = Tooltip.directions;

	direction = direction.charAt(0).toUpperCase() + direction.substr(1);
	opposite = directions[direction];
	elm.style.position = "absolute";
	elm.style.borderStyle = "solid";

		for( dir in directions ) {
		oppositeDir = directions[dir];

			if( dir !== direction && oppositeDir !== opposite ) {
			elm.style["border"+dir+"Width"] = size + "px";
			elm.style["border"+dir+"Color"] = "transparent";		
			}

		}

	elm.style["border"+opposite+"Width"] = size + "px";
	elm.style["border"+opposite+"Color"] = color;
	elm.style["border"+direction+"Width"] = "0px";
	elm.style["border"+direction+"Color"] = "transparent";
	
	return this._applyOffsets( elm, direction, ( !!borderWidth ? size - borderWidth : size ), offset );	
	},
	
	_hiddenDimensions: function( elm ) {
	var width, height,
		
		oldD = elm.style.display;
		oldL = elm.style.left;
		oldT = elm.style.top;
	
	elm.style.display = "block";
	elm.style.visibility = "hidden";
	elm.style.top = "-9999px";
	elm.style.left = "-9999px";
	document.body.appendChild( elm );
	width = elm.offsetWidth;
	height = elm.offsetHeight;
	document.body.removeChild( elm );
	elm.style.top = oldT;
	elm.style.display = oldD;
	elm.style.left = oldL;
	elm.style.visibility = "";
	return {width: width, height: height};
	},
	
	_defaults: {
		"arrowBorder": "0px transparent",
		"arrowBackgroundColor":"#000000",
		"arrowSize":"5px",
		"arrowDirection":"left",
		"arrowOffset":"5px",
		"delay": 0,
		"classPrefix":"tooltip"
	},
	
	ondimensions: function(){
	return {top: 0, left: 0};
	},
	
	show: function( msg, x, y ) {
	
	var arrowOffset = parseInt( this._defaults.arrowOffset, 10 ),
		borderSplit = this._defaults.arrowBorder.split( " " ),
		arrowBgColor = this._defaults.arrowBackgroundColor,
		arrowBorderWidth = parseInt( borderSplit[0], 10 ) || null,
		arrowBorderColor = borderSplit[1];
		arrowSize = parseInt( this._defaults.arrowSize, 10 ),
		transition = this._defaults.transition || null,
		arrowDirection = this._defaults.arrowDirection;
	
	var div = document.createElement("div"),
		id = this._defaults.classPrefix+"-"+( this._idCounter++ ),
		message = document.createElement("div"),
		appendTo = document.getElementById(this._defaults.appendTo || "") || document.body,
		hiddenDimensions, obj, key, px;
				
	
	div.id = id;
	
	message.className = this._defaults.classPrefix + "-message";
	message.innerHTML = msg;
	div.className = this._defaults.classPrefix + "-container";
	div.appendChild( message );
	
	div.style.position = "absolute";
	
		if( arrowBorderWidth && arrowBorderColor ) {
		div.appendChild( this._arrowize( document.createElement( "div" ),
			arrowOffset,
			arrowBorderColor,
			arrowSize,
			arrowDirection ) );
		}
		
	div.appendChild( this._arrowize( document.createElement("div"), arrowOffset, arrowBgColor, arrowSize, arrowDirection, arrowBorderWidth ) );	
		if( x == null || y == null ) {
		hiddenDimensions = this._hiddenDimensions( div );
		obj = this.ondimensions.call( this, hiddenDimensions.width, hiddenDimensions.height );
			for( key in obj ) {
			px = obj[key]
			div.style[key] = typeof px == "number" ? px+"px" : px;
			}
		} else {
		div.style.left = x + "px";
		div.style.top = y + "px";
		}

	div.style.zIndex = "10000";
	this._currentId.push( id );
	appendTo.appendChild( div );
		if( transition && typeof transition == "string" && jQuery.fn[transition] ) {
		jQuery(div)[transition]( this.delay );
		}
	return this;
	},
	hide: function(){
	var i, l = this._currentId.length, elm;
	
		if( !l ) {
		return false;
		}
	
		for( i = 0; i < l; ++i ) {
		jQuery( "#"+this._currentId[i]).stop( true, true ).remove();
		}
	this._currentId = [];
	return true;
	}
});