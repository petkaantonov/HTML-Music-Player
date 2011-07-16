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