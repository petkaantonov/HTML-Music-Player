function ActionMenu( target, opts ){
var self = this, c = 0;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-searchcon";
	}

this._target = target.id;
this._name = opts && opts.name || ( +new Date)+"menu";
this._disabledClass = opts && opts.disabledClass || "menu-item-disabled";
this._selector = opts && opts.selector || ".menu-selector";
this._disabled = {};

	$( this._selector, target ).each( function( index ){
	this.id = self._name+"-menu-item-"+index;
	c++;
	});

	$( "#"+this._target).delegate( this._selector, "click", function(e) {
	var id = this.id; 
	
	id = +( id.substr( id.lastIndexOf( "-" ) + 1 ) );
	
		if( self._disabled[ id ] ) {
		return true;
		}
	
	self.onmenuclick.call( self, id );
	});
	
this.length = c;
}

ActionMenu.Includes({
	onmenuclick: function( menuId ){},
	show: function(){
	$( "#"+this._target).show();
	return this;
	},
	hide: function(){
	$( "#"+this._target).hide();
	return this;
	},
	__enableAll: function(){
	var i, l = this.length;
		for( i = 0; i < l; ++i ) {
		$( "#"+this._name+"-menu-item-"+i ).removeClass( this._disabledClass );
		delete this._disabled[ i ];				
		}
	return this;
	},
	__disableAll: function(){
	var i, l = this.length;
		for( i = 0; i < l; ++i ) {
		$( "#"+this._name+"-menu-item-"+i ).addClass( this._disabledClass );
		this._disabled[ i ] = true;
		}
	return this;
	},
	activate: function( indices ) {
	var i, l = this.length;
	
		if( indices == "all" ){
		return this.__enableAll();
		}
		else if( indices == "none" ){
		return this.__disableAll();
		}
		else if( indices.constructor !== Array ) {
		indices = [indices];
		}
		
	indices = indices.toKeysObj();
		
		for( i = 0; i < l; ++i ) {
			if( i in indices ) {
			$( "#"+this._name+"-menu-item-"+i ).removeClass( this._disabledClass );
			delete this._disabled[ i ];			
			}
			else {
			$( "#"+this._name+"-menu-item-"+i ).addClass( this._disabledClass );
			this._disabled[ i ] = true;
			}
		}
	return this;
	}
});