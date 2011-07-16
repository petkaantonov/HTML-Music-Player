function SingleSelectable( target, selector, opts ) {
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;
	if( !target.id ) {
	target.id = "selectable-single-"+(+new Date );
	}
this._target = target.id;
this._selector = selector;
this._activeClass = opts && opts.activeClass || "select-active";
this._selection = null;

	$( "#"+this._target ).delegate( selector, "click", function( e ) {
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
		var i, l, all = $( this._selector, document.getElementById( this._target ) );
		$( all[this._selection] ).addClass( this._activeClass );
		
		this.onselect.call( this, this._selection );
		}		
}).Destroy( [ "all", "invert", "_removeSelection", "_appendingShiftSelection", "_shiftSelection" ] );
