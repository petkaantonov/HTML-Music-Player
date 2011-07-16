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