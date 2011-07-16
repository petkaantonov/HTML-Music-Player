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