var nodecache = new NodeCache(), tabs, playlist = {}, features = {},
	storage = Storage(), popup;

var appData = storage.get( "appData" ) || ( storage.set( "appData", {} ) && storage.get( "appData" ) ),
	appSetData = function( key, value ) {
	return storage.update( "appData", key, value );
	};
	
var POSITIVE = "#3DFF3D",
	NEGATIVE = "#FF8095",
	
	PLAYLIST_CHANGES_START = "20px",
	PLAYLIST_POSITIVE_END = "-20px",
	PLAYLIST_NEGATIVE_END = "60px",
			
	QUEUE_CHANGES_START = "57px",
	QUEUE_POSITIVE_END =  "17px",
	QUEUE_NEGATIVE_END = "97px",
	
	TEST_PASS = "<span style=\"color:#00BD00;\">"+String.fromCharCode(10004)+"</span>",
	TEST_FAIL = "<span style=\"font-weight: bold;color: #8B0000;\">"+String.fromCharCode(10005)+"</span>",
				
	SORT_ALPHA_ASC = function( obj, str ) {
		return function( a, b ) {
		var f = obj[ a ][ str ].toLowerCase(),
		s = obj[ b ][ str ].toLowerCase();
		return ( f == s ? 0 : ( f < s ? -1 : 1 ) );
		};
	},
	
	SORT_NUMBER_ASC = function(a,b){return a-b;};



function updateSelection( count ) {
var plural = count === 1 ? "" : "s";
document.getElementById( "app-selection-count").innerHTML = count + " item"+plural;
};

$.easing.easeInExpo = function (x, t, b, c, d) {
return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
};

$.easing.easeInQuart = function (x, t, b, c, d) {
return c*(t/=d)*t*t*t + b;
};

function animateChanges( obj ) {
var count = obj.count,
	color = obj.color,
	start = obj.start,
	end = obj.end,
	elm = $("<div class=\"app-changes app-bold-number\"></div>").appendTo( $('#app-changes-container') );

elm.css({color: color, top: start, opacity: 1}).html( count );
elm.animate({top: end, opacity: 0}, 1400, "easeInQuart", function(){$(this).remove();});
}

popup = new BlockingPopup( 500, 300, { closer: ".app-popup-closer", addClass: "app-popup-container" } );

popup.onbeforeopen = function( id ){
$( "#"+id ).hide().fadeIn( 400 );
};

popup.onclose = function(){
hotkeys.manager.enable();
	if( !this.length ) {
	$( "#app-container" ).fadeTo( 0, 1 );
	}
}
popup.onopen = function(){
hotkeys.manager.disable();
	if( this.length < 2 ) {
	$( "#app-container").fadeTo(0, 0.3 );
	}
}

$(document).bind('dragenter', function(ev) {
	return false;
    })
    .bind('dragleave', function(ev) {
    return false;
    })
    .bind('dragover', function(ev) {
    return false;
    })
    .bind('drop', function(ev) {
    playlist.localFiles.handle( ev.originalEvent.dataTransfer.files );
    })
    .bind("selectstart", function(){
    return false;
    });
    
   



