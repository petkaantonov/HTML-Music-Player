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