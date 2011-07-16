function Table( appendTo, nodecache, opts ) {
var table = document.createElement( "table" ), i, th, data, headers, classPrefix,
	frag = document.createDocumentFragment(),
	tbody = document.createElement( "tbody" ),
	thead = document.createElement( "thead" ),
	tr = document.createElement( "tr" );
	if( typeof appendTo == "string" )
	appendTo = document.getElementById( appendTo );

	if( appendTo == null)
	return {};

headers = opts && opts.captions || {};
this._nodecache = nodecache;
this._naText = opts && opts.naText || "N/A";
this._id = "dyn__table__" + ( Table.tid++ );
this._className = classPrefix = opts && opts.classPrefix || "class-default";
this._names = [];
this.length = 0;
table.id = this._id;
table.className = classPrefix + "-table";
thead.className = classPrefix + "-thead";
tbody.className = classPrefix + "-tbody";
tr.className = classPrefix + "-thead-tr";

	for( i in headers ) {
	this._names.push( i );
	th = document.createElement("th");
	data = nodecache._getData.call( nodecache, th );	
	data.headerName = i;
	th.innerHTML = headers[i];
	tr.appendChild( th );
	}

thead.appendChild( tr );
table.appendChild( thead );
table.appendChild( tbody );
frag.appendChild( table );

appendTo.appendChild( frag );
}

Table.Includes({
	STATIC__SliceHTML: typeof document.getElementById == "function" ?
			Array.prototype.slice :
			function(min, max){
			var len = this.length, i, max = max || len-1, r = [], min = min || 0;
				for( i = min; i <= max; ++i )
				r.push( this[i] );
			return r;
			},

	STATIC__tid: 0,

	length: 0,

	getHeaderName: function( elem ) {
	var data = this._nodecache._getData( elem );
	return data.headerName || null;
	},
	getRowData: function( elem, column ) {
	var r, data;
		if ( elem && elem.nodeName && elem.nodeName.toLowerCase() != "tr" ) {
		elem = elem.parentNode;

			while( elem != null ) {
				if( elem.nodeName.toLowerCase() == "tr" ) {
				break;
				}
			elem = elem.parentNode;
			}


		}

	data = this._nodecache._getData( elem );
	r = column ? data.rowdata && data.rowdata[column] : data.rowdata;

		if( +r ) {
		return parseFloat(r);
		}
	return r;
	},
	getElement: function( type, nth ){
	var elem = document.getElementById( this._id );

		if( elem == null )
		return null;

		if( 	type == "tbody" ||
			type == "thead" )
		return elem.getElementsByTagName( type )[0];

		else if ( type == "tr" ) {
		
			if( !isNaN( nth ) )
			return elem.getElementsByTagName( "tbody")[0].getElementsByTagName("tr")[nth];

			else
			return Table.SliceHTML.call( elem.getElementsByTagName( "tbody")[0].getElementsByTagName("tr"), 0 );	
		}
		else if ( type == "th" ) {
			if( !isNaN( nth ) )
			return elem.getElementsByTagName( "thead")[0].getElementsByTagName("th")[nth];

			else
			return Table.SliceHTML.call( elem.getElementsByTagName( "thead")[0].getElementsByTagName("th"), 0 );	
		}

	return elem;
	},
	
	removeRow: function( elem ) {
		if( elem instanceof Array ) {

			for( i = 0, l = elem.length; i < l; ++i ) {
			this.removeRow( elem[i] );
			} 
		}
		else if( typeof elem == "number" ) {
		elem = this.getElement( "tr", elem );
		}

		if( elem == null )
		return this;

	this.length--;
	this._nodecache._removeData( elem );
	elem.parentNode.removeChild( elem );
	return this;
	},

	addData: function( opts, cb ) {
	var i, l, tr, data, frag = document.createDocumentFragment();
		if( opts.constructor !== Array ) {
		opts = [opts]
		}

		if( !this._names.length ) 
		return this;

		for( i = 0, l = opts.length; i < l; ++i ) {
		tr = this._generateRow( opts[i], cb  );
		tr.id = this._className + "-" +this.length;
		data = this._nodecache._getData( tr );
		data.nth = this.length;
		data.rowdata = opts[i];
		frag.appendChild ( tr );
		this.length++;
		}
		
	this.getElement("tbody").appendChild( frag );
	return this;
	},

	_generateRow: function( rowdata, cb ) {
	var tablerow = document.createElement( "tr" ), html = "", td, classPrefix = this._className, names = this._names;

	tablerow.className = classPrefix + "-tbody-tr";
		for( i = 0, l = names.length; i < l; ++i ) {
		td = document.createElement( "td" );
		td.className = classPrefix + "-tbody-td";
		k = names[i];
			if( cb && typeof cb[k] == "function" ) {
			td.innerHTML = cb[k].call( this, rowdata );
			}
			else {
			td.innerHTML = rowdata[k] != null ? rowdata[k] : this._naText;
			}
		tablerow.appendChild( td );
		}
	return tablerow;
	},

	destroy: function() {
	var ref = document.getElementById( this._id );
		if( ref == null )
		return this;
	this.length = 0;
	this._names = [];
	this._nodecache._purgeCache();
	ref.parentNode.removeChild( ref );
	return this;
	}


});