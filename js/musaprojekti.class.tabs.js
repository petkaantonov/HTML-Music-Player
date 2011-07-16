function Tabs ( target, nodecache, tabsopts ) {
var elms, t, i, l, data, frag, ul, li, caption, disabled, getdata, length, idprefix, cclass, node;

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target == null || nodecache == null ) {
	return {};
	}

	if( target.id == null )
	target.id = "tabs-"+(+new Date );


this._nodecache = nodecache;

disabled = ( tabsopts && tabsopts.disabled && ( " " + tabsopts.disabled.join( " " ) + " " ) ) || "";

this._containerId = target.id;
this._idxprefix = idxprefix = "tabs-tab-" + (+ new Date );

this.ontabselect = tabsopts && typeof tabsopts.ontabselect == "function" ? tabsopts.ontabselect : function(){};
this._classPrefix = ( tabsopts && tabsopts.classPrefix ) || "tabs-default";
this._tabCaptions =  ( tabsopts && tabsopts.captions) || [];
this._contentHolderClass = cclass = ( tabsopts && tabsopts.holderClass ) || "tabs-default-holder";
this._contentHolder = tabsopts && tabsopts.contentHolder || target;
this._contentHolder = typeof this._contentHolder == "string" ? document.getElementById( this._contentHolder ) : this._contentHolder;

this._selected = null;
this.length = 0;
getData = this._nodecache._getData;
t = this._contentHolder.getElementsByTagName( "*" );


l = t.length;
frag = document.createDocumentFragment();
ul = document.createElement("ul");
ul.id = this._tabsContainerId = "tabs-container"+(+new Date );
ul.className = this._classPrefix+"-tabs-container";


 
	for( i = 0; i < l; ++i ) {
	node = t[i];
	
		if( ( " " + node.className + " " ).indexOf( " " + cclass + " " ) > -1 ) {
		node.style.display = "none";
		li = document.createElement("li");
		data = getData.call( nodecache, li );
		length = this.length;
		li.id = idxprefix + length;
		data.caption = caption = this._tabCaptions[ length ] || "Tab "+( length + 1 );
		data.elem = node;
		data.nth = length;
		li.className = this._classPrefix+"-tab";
		li.innerHTML = caption;
		
			if( disabled.indexOf( " " + length + " " ) > -1 )
			this.disableTab( li );
			
		ul.appendChild(li);
		this.length++;
		}
	}
frag.appendChild(ul);
target.insertBefore( frag, target.firstChild );
	if( typeof tabsopts.select == "number")
	this.selectTab( this.getTab( tabsopts.select  ));
}
Tabs.Includes({
	length: 0,
	activeTab: 0,
	onbeforetabselect: function(){},
	ontabselect: function(){},

	_accessControl: function( elem, disabled ) {
	var i, l;
		if( typeof elem == "number")
		elem = this.getTab(elem );

		else if ( elem.constructor == Array ) {
		l = elem.length;
			for( i = 0; i < l; ++i ) {
			this._accessControl( this.getTab(elem[i]), disabled )
			}
		return this;
		}
	var data = this._nodecache._getData( elem );
	data.disabled = disabled ? true : false;
	CSS[(disabled ? "add" : "remove")+"Class"]( elem, this._classPrefix+"-tab-disabled" );
	return this;

	},

	disableTab: function( elem ) {
	return this._accessControl( elem, true );

	},

	prevTab: function() {
	var tabidx = this.activeTab - 1, tab, data, cache = this._nodecache, getData = cache._getData;

		if( tabidx < 0 )
		tabidx = 0;

	tab = this.getTab( tabidx );
	data = getData.call( cache, tab );

		while( data.disabled && --tabidx > 0 ) {
		tab = this.getTab( tabidx );
		data = getData.call( cache, tab );
		}

		if( data.disabled )
		return this;

	this.selectTab( tab );
	},

	nextTab: function() {
	var tabidx = this.activeTab + 1, tab, data, len = this.length - 1, cache = this._nodecache, getData = cache._getData;

		if( tabidx >= len )
		tabidx = len;

	tab = this.getTab( tabidx );
	data = getData.call( cache, tab );

		while( data.disabled && ++tabidx <= len ) {
		tab = this.getTab( tabidx );
		data = getData.call( cache, tab );
		}

		if( data.disabled )
		return this;

	this.selectTab( tab );

	},

	enableTab: function( elem ) {
	return this._accessControl( elem, false );
	},
	selectTab: function( elem ) {
	var data, data2, cache = this._nodecache, getData = cache._getData;
		
	data = getData.call( cache, elem )
	
		if( data.disabled == true || elem == this._selected ) {
		return this;
		}
		
	this.onbeforetabselect.call( this, this.activeTab, this._selected );

		if( this._selected != null ) {
		data2 = getData.call( cache, this._selected );
		data2.elem.style.display = "none";
		$( this._selected ).removeClass( this._classPrefix+"-tab-selected" );
		}
		

	data.elem.style.display = "block";
	this._selected = elem;
	this.activeTab = data.nth;
	$( this._selected ).addClass( this._classPrefix+"-tab-selected");
	this.ontabselect.call( this, this.activeTab, elem );
	return this;
	},

	getIndex: function( elem ){
	var cache = this._nodecache, data = cache._getData.call( cache, elem );
	return data.nth || null;
	},

	getTab: function( nth ){
	return typeof nth == "number" ? document.getElementById( this._idxprefix+nth ) : document.getElementById( this._tabsContainerId );
	}

});
