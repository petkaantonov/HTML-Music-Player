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
		self.onslideend.call( self, self.__percentage( e ) );
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
			e.preventDefault();
			return false;
			}

		);

	}
});