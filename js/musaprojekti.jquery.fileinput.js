(function($) {

$.fn.removeFiles = function(){
	return this.each( function(){
	var key, atts, hover,
		input = document.createElement("input"),
		self = $(this), obj, kk, stylestr = "",
		width = this.offsetWidth, height = this.offsetHeight, jqInput;
		
	atts = self.data( "atts" );
	hoverClass = self.data( "hoverClass" );
	
		for( key in atts ) {
			if( key == "style" ) {
			obj = atts[key];
				for( kk in obj ) {
				stylestr += ( kk +":"+obj[kk]+";" );			
				}
			continue;
			}
		input[key] = atts[key];
		}
		
	input["type"] = "file";
	input.setAttribute("style", "position:absolute;top:0px;left:0px;width:"+width +
			"px;height:"+height+"px;z-index:100000;opacity:0;-moz-opacity:0;" +
		"filter: alpha('opacity=0');"+stylestr);
		
	jqInput = $(input);
	jqInput.data( "atts", atts);
	jqInput.data( "hoverClass", hoverClass );
	
		if( hoverClass != null ) {
			jqInput.bind( "mouseover mouseout", function(e){
				if( e.type == "mouseover" ) {
				$(this.previousSibling).addClass( hoverClass );
				}
				else {
				$(this.previousSibling).removeClass( hoverClass );
				}
			});
		}

	this.parentNode.appendChild( input );
	self.remove();
	});
};

$.fn.fileInput = function( atts, hoverClass ){
atts = atts || {};
hoverClass = hoverClass || null;
	return this.each( function(){
	var input = document.createElement("input"), key,
		container = document.createElement("div"),
		width = this.offsetWidth, height = this.offsetHeight, obj, kk, stylestr = "", jqInput,
		$elm = $(this), minWidth = $elm.width(), minHeight = $elm.height(), maxHeight = $elm.outerHeight(true),
		maxWidth = $elm.outerWidth( true );
		
		for( key in atts ) {
			if( key == "style" ) {
			obj = atts[key];
				for( kk in obj ) {
				stylestr += ( kk +":"+obj[kk]+";" );			
				}
			continue;
			}
		input[key] = atts[key];
		}

	container.setAttribute( "style", "position:relative;width:"+maxWidth+"px;height:"+maxHeight+"px" );
	input["type"] = "file";
	input.setAttribute("style", "position:absolute;top:0px;left:0px;width:"+maxWidth +
		"px;height:"+maxHeight+"px;z-index:100000;opacity:0;-moz-opacity:0;" +
		"filter: alpha('opacity=0');"+stylestr);

	jqInput = $(input);
	jqInput.data( "atts", atts);
	jqInput.data( "hoverClass", hoverClass );
	this.style.position = "absolute";
	this.style.left = "0px";
	this.style.top = "0px";
	this.style.zIndex = "1";
	this.style.width = minWidth+"px";
	this.style.height = minHeight+"px";
	this.parentNode.insertBefore( container, this );
	container.appendChild( this.parentNode.removeChild( this ) );
	container.appendChild( input );
	
		if( hoverClass != null ) {
			jqInput.bind( "mouseover mouseout", function(e){
				if( e.type == "mouseover" ) {
				$(this.previousSibling).addClass( hoverClass );
				}
				else {
				$(this.previousSibling).removeClass( hoverClass );
				}
			});
		}
	});
};

})(jQuery);