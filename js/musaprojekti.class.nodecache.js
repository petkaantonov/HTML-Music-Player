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
