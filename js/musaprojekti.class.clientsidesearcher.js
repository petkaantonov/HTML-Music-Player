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
