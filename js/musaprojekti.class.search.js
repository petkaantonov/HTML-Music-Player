function Search( target, opts ){
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-searchcon";
	}

this._target = target.id;
this._searchTypes = {};
this._className = opts && opts.addClass || "search-result";
this._results = [];
this._searching = false;
}

Search.Includes({
	getContainer: function(){
	return this._results;
	},
	onsearchresults: $.noop,
	onbeforesearch: $.noop,
	onaftersearch: $.noop,
	addType: function( name, fn, callback ) {
	this._searchTypes[ name ] = fn;
	return this;
	},
	search: function( type, query, nohistory ) {
		if( this._searching == true ) {
		return this;
		}
	$( "#"+this._target).empty();
	this._results = [];
	this.onbeforesearch( query, type );
	this._searching = true;
		if( typeof this._searchTypes[ type ] != "function" ){
		return this;
		}
	this._searchTypes[ type ].call( this, query );
	},
	addResults: function( arr, query, type ) {
	this.onaftersearch( query, type, arr.length );
	this._searching = false;
	var i, l = arr.length;

		if( !l) {
		return this;
		}
	
	this._results = arr;
	this.onsearchresults.call( this, arr, query );
	return this;
	}


});