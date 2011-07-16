function Loader( identifier, storage, jsonparser ) {
this._validNames = /[\/:*?"<>|\s]/g;
this._storage = storage;
this._identifier = identifier.replace( this._validNames, "" );
this._jsonparser = jsonparser || window.JSON.parse;
}

Loader.Includes({
	list: function(){
	var r = [], key, data = this._storage.get( this._identifier );
	
		if( data ) {
			for( key in data ) {
			r.push({name: key, length: data[key].length});
			}
		}
	return r;
	},
	"import": function( file ) {
	var loadobj = {error: "FileReader not supported by browser", name: ( file && file.name || "default" ), data: ""}, reader, self = this;
	
		if( !( "FileReader" in window ) ) {
		this.onload.call( this, loadobj );
		return this;
		}
	reader = new window.FileReader();
	
		reader.onloadend = function(e){

			try {
			loadobj.data = self._jsonparser( e.target.result );			
			}
			catch(e) {
			loadobj.data = {};
			}
		delete loadobj.error;
		self.onload.call( self, loadobj );
		};
	
	reader.readAsText( file );
	return this;
	},
	load: function( name) {
	var data, loadobj = {error: "Can't find playlist named " +name, name: name, data: ""};
	
	var data = this._storage.get( this._identifier );
	
		
		if( !name || !data || !data[name] ) {
		this.onload.call( this, loadobj );
		return this;
		}
		
		
		
	delete loadobj.error;
	loadobj.data = data[name];
	this.onload.call( this, loadobj );
	return this;
	},
	onload: function( loadobj ){}

});