function History( max ){
this._container = [];
this._ignore = false;
this._max = max || 50;

}

History.Includes({
	ignore: function(){
	this._ignore = true;
	},
	onnewentry: jQuery.noop,
	onremoveentry: jQuery.noop,
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
