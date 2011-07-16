function Selectable( target, selector, opts ) {
var self = this;
this._max = 0;
target =  typeof target == "string" ? document.getElementById( target ) : target;
	if( !target.id ) {
	target.id = "selectable-"+(+new Date );
	}
	
this._target = target.id;
this._selector = selector;
this._activeClass = opts && opts.activeClass || "select-active";
this._selectionPointer = null;
this._lastIdx = null;
this._lastStart = null;
this._lastEnd = null;
this._selection = [];

	$( "#"+this._target ).delegate( selector, "mousedown click", function( e ) {
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
	var undef, i, l, all = $( this._selector, document.getElementById( this._target ) );

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