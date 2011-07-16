function Tooltip( opts ){
this._defaults = jQuery.extend( {}, this._defaults, opts );
this._currentId = [];
this._idCounter = +new Date;

}

Tooltip.directions = {
	"Left":"Right",
	"Right":"Left",
	"Top":"Bottom",
	"Bottom":"Top"
};

Tooltip.Includes( {
	_applyOffsets: function( elm, direction, size, offset ) {
	
		switch( direction ) {
		case "Left":
		elm.style.left = "-"+size+"px";
		elm.style.top = offset+"px";
		break;
		case "Right":
		elm.style.right = "-"+size+"px";
		elm.style.top = offset+"px";
		break;
		case "Top":
		elm.style.top = "-"+size+"px";
		elm.style.left = offset+"px";
		break;
		case "Bottom":
		elm.style.bottom ="-"+size +"px";
		elm.style.left = offset+"px";
		break;
		}

	return elm;
	},
	_arrowize: function( elm, offset, color, size, direction, borderWidth ) {
	var dir, oppositeDir, opposite, directions = Tooltip.directions;

	direction = direction.charAt(0).toUpperCase() + direction.substr(1);
	opposite = directions[direction];
	elm.style.position = "absolute";
	elm.style.borderStyle = "solid";

		for( dir in directions ) {
		oppositeDir = directions[dir];

			if( dir !== direction && oppositeDir !== opposite ) {
			elm.style["border"+dir+"Width"] = size + "px";
			elm.style["border"+dir+"Color"] = "transparent";		
			}

		}

	elm.style["border"+opposite+"Width"] = size + "px";
	elm.style["border"+opposite+"Color"] = color;
	elm.style["border"+direction+"Width"] = "0px";
	elm.style["border"+direction+"Color"] = "transparent";
	
	return this._applyOffsets( elm, direction, ( !!borderWidth ? size - borderWidth : size ), offset );	
	},
	
	_hiddenDimensions: function( elm ) {
	var width, height,
		
		oldD = elm.style.display;
		oldL = elm.style.left;
		oldT = elm.style.top;
	
	elm.style.display = "block";
	elm.style.visibility = "hidden";
	elm.style.top = "-9999px";
	elm.style.left = "-9999px";
	document.body.appendChild( elm );
	width = elm.offsetWidth;
	height = elm.offsetHeight;
	document.body.removeChild( elm );
	elm.style.top = oldT;
	elm.style.display = oldD;
	elm.style.left = oldL;
	elm.style.visibility = "";
	return {width: width, height: height};
	},
	
	_defaults: {
		"arrowBorder": "0px transparent",
		"arrowBackgroundColor":"#000000",
		"arrowSize":"5px",
		"arrowDirection":"left",
		"arrowOffset":"5px",
		"delay": 0,
		"classPrefix":"tooltip"
	},
	
	ondimensions: function(){
	return {top: 0, left: 0};
	},
	
	show: function( msg, x, y ) {
	
	var arrowOffset = parseInt( this._defaults.arrowOffset, 10 ),
		borderSplit = this._defaults.arrowBorder.split( " " ),
		arrowBgColor = this._defaults.arrowBackgroundColor,
		arrowBorderWidth = parseInt( borderSplit[0], 10 ) || null,
		arrowBorderColor = borderSplit[1];
		arrowSize = parseInt( this._defaults.arrowSize, 10 ),
		transition = this._defaults.transition || null,
		arrowDirection = this._defaults.arrowDirection;
	
	var div = document.createElement("div"),
		id = this._defaults.classPrefix+"-"+( this._idCounter++ ),
		message = document.createElement("div"),
		appendTo = document.getElementById(this._defaults.appendTo || "") || document.body,
		hiddenDimensions, obj, key, px;
				
	
	div.id = id;
	
	message.className = this._defaults.classPrefix + "-message";
	message.innerHTML = msg;
	div.className = this._defaults.classPrefix + "-container";
	div.appendChild( message );
	
	div.style.position = "absolute";
	
		if( arrowBorderWidth && arrowBorderColor ) {
		div.appendChild( this._arrowize( document.createElement( "div" ),
			arrowOffset,
			arrowBorderColor,
			arrowSize,
			arrowDirection ) );
		}
		
	div.appendChild( this._arrowize( document.createElement("div"), arrowOffset, arrowBgColor, arrowSize, arrowDirection, arrowBorderWidth ) );	
		if( x == null || y == null ) {
		hiddenDimensions = this._hiddenDimensions( div );
		obj = this.ondimensions.call( this, hiddenDimensions.width, hiddenDimensions.height );
			for( key in obj ) {
			px = obj[key]
			div.style[key] = typeof px == "number" ? px+"px" : px;
			}
		} else {
		div.style.left = x + "px";
		div.style.top = y + "px";
		}

	div.style.zIndex = "10000";
	this._currentId.push( id );
	appendTo.appendChild( div );
		if( transition && typeof transition == "string" && jQuery.fn[transition] ) {
		jQuery(div)[transition]( this.delay );
		}
	return this;
	},
	hide: function(){
	var i, l = this._currentId.length, elm;
	
		if( !l ) {
		return false;
		}
	
		for( i = 0; i < l; ++i ) {
		jQuery( "#"+this._currentId[i]).stop( true, true ).remove();
		}
	this._currentId = [];
	return true;
	}
});