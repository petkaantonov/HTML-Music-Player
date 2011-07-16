function Saver( identifier, storage, opts ){
this._validNames = /[\/:*?"<>|\s]/g;
this._storage = storage;
this._identifier = identifier.replace( this._validNames, "" );
this._exportURL = opts && opts.exportURL || null;
this._jsonstringify = opts && opts.jsonstringify || window.JSON.stringify;
}

Saver.Includes({
	onexport: function( response ) {},
	"export": function( name, data ) {
	var r = [], i, l, elm;
		if( this._exportURL == null ) {
		this.onexport.call( this, {error: true} );
		return this;
		}
	var self = this;
	
		if( !data ) {
		return this;
		}
		
	l = data.length;
		
		for( i = 0; i < l; ++i ) {
		elm = data[i];
			if( !( "parsed" in elm ) ) {
			r.push( elm );	
			}
		
		}
	
		if( !r.length ) {
		saveobj.error = "No data to save";
		this.onsave.call( this, saveobj );
		return this;
		}
	
		$.ajax({
		"data": {"filename": name, "data": self._jsonstringify( r ) },
		"datatype": "json",
		"type": "POST",
		"url": this._exportURL,
			"success": function( obj ) {
			self.onexport.call( self, obj );
			},
			"error": function() {
			self.onexport.call( self, {error: "Communication failed with server, try again later"} );
			}
		});
	
	},
	onsave: function( obj ){},
	onoverwrite: function( obj ){},
	save: function( name, json, override ){
	var i, l, data, r = [], elm;
	saveobj = {error: "Invalid Name", name: name, data: json};
		if( !name ) {
		this.onsave.call( this, saveobj );
		return this;
		}
	saveobj.error = "No data to save";
		if( !json ) {
			if( !override ) {
			this.onsave.call( this, saveobj );
			}
		return this;		
		}
		
	name = name.replace( this._validNames, "" );
	data = this._storage.get( this._identifier );
	l = json.length;
		for( i = 0; i < l; ++i ) {
		elm = json[i];
			if( !( "parsed" in elm) ) {
			r.push( elm );	
			}
		}
		
		if( !r.length) {
			if( !override ) {
			this.onsave.call( this, saveobj );
			}
		return this;		
		}

		
	data = data || {};
	data[name] = r;
	this._storage.set( this._identifier, data );
	delete saveobj.error;
		if( !override ) {
		this.onsave.call( this, saveobj );
		}
	return this;
	}
});