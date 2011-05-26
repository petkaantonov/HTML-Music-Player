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
	
		if( node.className == cclass ) {
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
	},

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
	getContainer: function(){
	return this._hashList;
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
	return this;
	},
	add: function( arr ) {
	var i, l, curhash;
		if( arr.constructor !== Array ) {
		arr = [arr];
		}
	l = arr.length;
		for( i = 0; i < l; ++i ) {
		curhash = this._getHash();
		this._songList[ curhash ] = arr[ i ];
		this._hashList.push( curhash );
		}
	this.length = this._hashList.length;
	this.onupdate.call( this, this._songList, this._hashList, this._currentSong, this._selectable._selection );
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
			self._selectionPointer = null;
			self._lastEnd = null;
			self._lastIdx = null;
			self._lastStart = null;
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
		self._selectionPointer = null;
		self._lastEnd = null;
		self._lastIdx = null;
		self._lastStart = null;
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
	
	_render: function() {
	var i, l, all = $( this._selector, this._target );

	$( "."+this._activeClass ).removeClass( this._activeClass );
	this._selection = this._selection.unique();
	this._selection.sort(function(a, b){return (a - b);});
	l = this._selection.length;
	
		for( i = 0; i < l; ++i) {
		$( all[ this._selection[i] ] ).addClass( this._activeClass );
		}
	this.onselect.call( this, this._selection );
	},
	
	clearSelection: function(){
	this._selectionPointer = null;
	this._lastEnd = null;
	this._lastIdx = null;
	this._lastStart = null;
	this._selection = [];
	this._render();
	},
	getSelection: function(){
	return this._selection;
	},
	applyTo: function( arr, callback ) {
	var selection = this._selection, r = [], i, l = selection.length, $l;
	
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

function DraggableSelection( target, selectable, playlist, itemHeight, selector ) {
var self = this, tar;

this._songList = playlist._hashList;
this._selection = selectable._selection;
this._selectable = selectable;
this._playlist = playlist;
this._target = typeof target == "string" ? document.getElementById( target ) : target;
this._proximity = [];
this._selector = selector;
this._itemHeight = itemHeight;
this._nodes = [];
this._posChanged = false;
this._prevTotalOffset = null;
this._listOffset = 0;
this._listHeight = 0;
this._itemHeight = itemHeight;

tar = $( this._target );

	tar.bind( "selectstart", function(){
	return false;
	});

	tar.bind( "mousedown", function( evt ) {
		if( evt.which !== 1 ) {
		return true;
		}
	self._listOffset = this.offsetTop;
	self._listHeight = this.offsetHeight;
	self._proximity = self._selectable._selection.mapProximity();
	self._nodes = $( self._selector ).toArray();

		tar.bind("scroll", function( e ){
		tar.trigger("moving", [e] );
		});

		$( document ).bind("mousemove", function( e ){	
		tar.trigger("moving", [e] );
		});
	});
	
	$( document ).bind( "mouseup", function(){
	tar.unbind( "scroll" );
	$( document ).unbind( "mousemove" );
	self._prevTotalOffset = null;
		if( self._posChanged ) {
		self._posChanged = false;
		self._playlist.render();
		
		}
	
	});
	
	tar.bind( "moving", function( evt, evtreal ) {
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
	});	
}

DraggableSelection.Includes({
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

	$( "#"+this._target ).delegate( this._suggestClass, "mousedown", function(e){
	var id = this.id, index = +( id.substr( id.lastIndexOf( "-" ) + 1 ) );
	
		if( e.which === 1 ) {
		self.hide();
		self._suggestAction.call( self, self._suggestions[ index ], index  );
		}
	
	}).hide();

	$( document ).bind( "mouseup", function(){
	self.hide();
	});
	
	$( document ).bind( "keyup", function(e){
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
	});

}

SearchSuggestions.Includes( {
	getActiveSuggestion: function(){
	return this._activeSuggestion > -1 ? this._suggestions[ this._activeSuggestion ] : null;
	},

	_browsekeys: {
		37:-1,
		38:-1,
		39:1,
		40:1
	},
	
	newSuggestions: function( arr ) {
	this.hide();
	var i, l = arr.length, elm = document.getElementById( this._target ),
		div, txt, frag = document.createDocumentFragment();
	this._suggestions = arr;
	
		if( !l ) {
		return;
		}
	
		for( i = 0; i < l; ++i ) {
		txt = document.createTextNode( arr[i] );
		div = document.createElement("div");
		div.id = "suggestion-"+i;
		div.className = this._className;
		div.appendChild( txt );		
		frag.appendChild( div );
		}
	elm.appendChild( frag );
	elm.style.display = "block";
	this._hasSuggestions = true;	
	return this;
	},
	hide: function(){
	this._activeSuggestion = -1;
	this._hasSuggestions = false;
	$( "#"+this._target ).empty().hide();
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
	onbeforesearch: function( query, type ){},
	onaftersearch: function( query, type, results ){},
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
	var i, l = arr.length, div, frag = document.createDocumentFragment(), txt;
	

	
		if( !l) {
		
		return this;
		}
	
	this._results = arr;
	
		for( i = 0; i < l; ++i ) {
		txt = document.createTextNode( arr[i].name );
		div = document.createElement( "div" );
		div.className = this._className;
		div.id = "result-"+i;
		div.appendChild( txt );
		frag.appendChild( div );
	
		}
	
	document.getElementById( this._target ).appendChild( frag );
		

	
	return this;
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
// Myös. search.play(), playlist.play() on eri
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
	__disable: function( indices) {
	var i, l = indices.length, val;
		for( i = 0; i < l; ++i ) {
		val = indices[i];
		$( "#"+this._name+"-menu-item-"+val ).addClass( this._disabledClass );
		this._disabled[ val ] = true;
		}
	return this;
	},
	__enable: function( indices ) {
	var i, l = indices.length, val;
		for( i = 0; i < l; ++i ) {
		val = indices[i];
		$( "#"+this._name+"-menu-item-"+val ).removeClass( this._disabledClass );
		delete this._disabled[ val ];
		}
	return this;
	},
	__action: function( type, indices ){
	
		if( indices == "all" ) {
		indices = [].range( 0, this.length - 1 );
		}
	
		else if( indices.constructor !== Array ) {
		indices = [indices];
		}
	
	return this["__"+type]( indices );
	},
	
	disable: function( indices ){
	return this.__action( "disable", indices );
	},
	enable: function( indices ){
	return this.__action( "enable", indices );
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

