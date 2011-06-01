var nodecache = new NodeCache(), tabs, playlist = {}, search = {}, queue = {}, scrolls, features = {},
	storage = Storage(), popup, flier = new FlyingMessage( "app-popup-message" );

var appData = storage.get( "appData" ) || ( storage.set( "appData", {} ) && storage.get( "appData" ) ),
	appSetData = function( key, value ) {
	return storage.update( "appData", key, value );
	};
	
var TAB_SEARCH = 0,
	TAB_PLAYLIST = 1,
	TAB_VIDEO = 2,
	TAB_QUEUE = 3,
	TAB_FILTER = 4,
	TAB_SETTINGS = 5,
	TAB_SEARCH_SCROLL = 0,
	TAB_PLAYLIST_SCROLL = 0,
	TAB_QUEUE_SCROLL = 0,
	TAB_SETTINGS_SCROLL = 0,
	PLAYLIST_ITEM_HEIGHT = 15,
	QUERY_PLACEHOLDER = "Enter search term";
	POSITIVE = "#3DFF3D",
	NEGATIVE = "#FF8095",
	
	PLAYLIST_CHANGES_START = "20px",
	PLAYLIST_POSITIVE_END = "-20px",
	PLAYLIST_NEGATIVE_END = "60px",
	
	SEARCH_CHANGES_START = "0px",
	SEARCH_POSITIVE_END = "-40px",
	SEARCH_NEGATIVE_END = "40px",
		
	QUEUE_CHANGES_START = "57px",
	QUEUE_POSITIVE_END =  "17px",
	QUEUE_NEGATIVE_END = "97px",
	
	TEST_PASS = "<span style=\"color:#00BD00;\">"+String.fromCharCode(10004)+"</span>",
	TEST_FAIL = "<span style=\"font-weight: bold;color: #8B0000;\">"+String.fromCharCode(10005)+"</span>",
	
	MAP_MAIN_INTERFACES = {},
	
	SEARCH_HISTORY_TYPE = {
		"youtube":"ytsmall.png",
		"mp3":"mp3.png"
	},
			
	SORT_ALPHA_ASC = function( obj, str ) {
		return function( a, b ) {
		var f = obj[ a ][ str ].toLowerCase(),
		s = obj[ b ][ str ].toLowerCase();
		return ( f == s ? 0 : ( f < s ? -1 : 1 ) );
		};
	},
	
	SORT_NUMBER_ASC = function(a,b){return a-b;};

function createSorter( targetArray, sortFunc ) {
var args = Array.prototype.slice.call( arguments, 2 ) || [];
	return function( songs ) {
	var i, selection = this._selection, l = selection.length, song;
		if( !songs || songs.length < 2 ) {
		return;
		}
	songs[ sortFunc ].apply( songs, args );
		for( i = 0; i < l; ++i ) {
		song = songs[i];
		targetArray[ selection[i] ] = song;
		}
	};
}



function updateSelection( count ) {
var plural = count === 1 ? "" : "s";
document.getElementById( "app-selection-count").innerHTML = count + " item"+plural;
};

function searchIt( query ) {

	if( !query || query == QUERY_PLACEHOLDER ){
	return true;
	}
var type = $( "#app-youtube-mode")[0].checked ? "youtube" : "mp3";
search.main.search( type, query );
}

$.easing.easeInExpo = function (x, t, b, c, d) {
return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
};

$.easing.easeInQuart = function (x, t, b, c, d) {
return c*(t/=d)*t*t*t + b;
};

function switchInterface( menuId ){
var key, n, menu, elms = $( ".menul-select-all" ).add( ".menul-invert" );
search.selections.clearSelection();
playlist.selections.clearSelection();

	if( MAP_MAIN_INTERFACES[ menuId ].selections ) {

	elms.removeClass( "app-action-disabled" );
	}
	else {
	elms.addClass( "app-action-disabled" );	
	}

	for( key in MAP_MAIN_INTERFACES ) {
	menu = MAP_MAIN_INTERFACES[ key ].menu;
		if( !menu ) {
		continue;
		}
	n = +key;
		if( menuId === n ) {
		menu.show();		
		}
		else {
		menu.hide();
		}
	}
scrolls.restore( menuId );
}

function animateChanges( obj ) {
var count = obj.count,
	color = obj.color,
	start = obj.start,
	end = obj.end,
	elm = $("<div class=\"app-changes app-bold-number\"></div>").appendTo( $('#app-changes-container') );

elm.css({color: color, top: start, opacity: 1}).html( count );
elm.animate({top: end, opacity: 0}, 1400, "easeInQuart", function(){$(this).remove();});
}
	
tabs = new Tabs( "app-tabs-container", nodecache, {
		holderClass: "content",
		contentHolder: "app-content-holder",
		classPrefix: "app-action",
		captions: [
			"Search",
			"Playlist",
			"Video",
			"Queue",
			"Filter",
			"Settings"
		]
	}
);

tabs.ontabselect = switchInterface;

$( tabs.getTab( TAB_SEARCH ) ).addClass("menul-search");
$( tabs.getTab( TAB_PLAYLIST ) ).addClass("menul-playlist");
$( tabs.getTab( TAB_VIDEO ) ).addClass("menul-video");
$( tabs.getTab( TAB_QUEUE ) ).addClass("menul-queue");
$( tabs.getTab( TAB_FILTER ) ).addClass("menul-filter");
$( tabs.getTab( TAB_SETTINGS ) ).addClass("menul-settings");

$( tabs.getTab() ).delegate( "li", "click", function(){
scrolls.calculate( tabs.activeTab );
tabs.selectTab( this );
});



popup = new BlockingPopup( 500, 300, { closer: ".app-popup-closer", addClass: "app-popup-container" } );

popup.onclose = function(){
console.log( this.length );
	if( !this.length ) {
	$( "#app-container" ).fadeTo( 0, 1 );
	}
}
popup.onopen = function(){
	if( this.length < 2 ) {
	$( "#app-container").fadeTo(0, 0.3 );
	}
}

scrolls = new Scrolls( (function(){var r = {};
			r[ TAB_SEARCH ] = "#app-result-container";
			r[ TAB_PLAYLIST] = "#playlist";
			return r;
			})());

queue.menu = new ActionMenu( "queue-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "queue"
}).disable( "all" );

playlist.menu = new ActionMenu( "playlist-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "playlist"
}).disable( "all" );

search.menu = new ActionMenu( "search-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "search"
}).disable( "all" );

search.menu.orderedActions = {
	"0":	function( songs ) {
		var $l = songs.length;
		playlist.main.add( songs ).changeSong( playlist.main.getHashByIndex( playlist.main.length - $l ) );
		},
	"1":	function( songs ) {
		download.main( songs[0] );
		},
	"2":	function( songs ) {
		playlist.main.add( songs );
		},
	"3":	function( songs ) {
		var $l = songs.length;	
		playlist.main.add( songs )
		queue.main.add( songs );
		}
};

new InputPlaceholder( "app-search-box", {text: QUERY_PLACEHOLDER, style: {color: "#999999", fontStyle: "italic"}});

playlist.songDisplay = new SongDisplay( "app-song-display" );
playlist.selections = new Selectable( "playlist", ".app-song", {activeClass: "app-song-active"} );
playlist.main = new Playlist( playlist.selections, {songList: [{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"}]} );
playlist.dragging = new DraggableSelection( "playlist", playlist.selections, playlist.main, PLAYLIST_ITEM_HEIGHT, ".app-song-container" );
playlist.ip = __IP_GET__();

playlist.getTotalTime = function( arr ){
var tTime = 0, i, l = arr.length, time;

	for( i = 0; i < l; ++i ) {
	time = arr[i].pTime || 0;
	tTime += time;
	}
return tTime && util.toTimeString( tTime ) || "N/A";
}
playlist.saver = new Saver( "PlaylistJSON", storage, {exportURL: "ajax/exportJSON.php" });
playlist.loader = new Loader( "PlaylistJSON", storage );

playlist.loader.onload = function( resp ) {
var valid, key, name = resp && resp.name || "";
	if( resp && typeof resp.data == "object" && resp.data.constructor !== Array ) {
	 	for( key in resp.data ) {
	 	name = key;
	 	resp.data = resp.data[key];
	 	}
	
	}

	if( !resp.error ) {
	valid = JSONSchema.validate( resp.data, SCHEMA_PLAYLIST );
		if( valid.valid ) {
			$( popup.html( '<table style="height:90%;"><tbody><tr><td><h2 class="app-header-2 centered">Loading</h2></td></tr></tbody></table>') ).fadeOut( 700, function(){
			popup.closeAll();
			playlist.main.add( resp.data );
			});
		return true;
		} else {
		resp.error = "Invalid playlist format";
		}
	}
popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
}

playlist.saver.onexport = function( resp ) {
appSetData( "playlistName", resp.name );
appSetData( "saveMethod", "file" );
	if( !resp.error) {
	window.document.location = resp.url;
	popup.closeAll();
	return;
	}
popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
};

playlist.saver.onsave = function( resp ) {
appSetData( "playlistName", resp.name );
appSetData( "saveMethod", "mem" );

	if( !resp.error ) {
		$( popup.html( '<table style="height:90%;"><tbody><tr><td>'+
				'<h2 class="app-header-2 centered">Saved</h2></td></tr></tbody></table>') ).fadeOut( 1200, function(){
		popup.closeAll();
		});
	return;
	}

popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
};

playlist.menu.orderedActions = {
	"0":	function( songs ) {
		playlist.main.changeSong( songs[0] );
	},
	"1":	function( songs ) {
		download.main( songs[0] );
	},
	"2":	function( songs ) {
		queue.main.add( songs );
	},
	"3":	function( songs ) {
		playlist.main.remove( songs );
	},
	
	"4":	createSorter( playlist.main._hashList, "reverse" ),

	"5":	createSorter( playlist.main._hashList, "sort", SORT_ALPHA_ASC( playlist.main["_songList" ], "name" ) ),
	
	"6":	createSorter( playlist.main._hashList, "shuffle" )
		
};

playlist.main.onadd =function( count ) {
animateChanges({color: POSITIVE, count: "+"+count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_POSITIVE_END});
};

playlist.main.onremove = function( count ) {
animateChanges({color: NEGATIVE, count: "-"+count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_NEGATIVE_END});
};


MAP_MAIN_INTERFACES[ TAB_SEARCH ] = search;
MAP_MAIN_INTERFACES[ TAB_PLAYLIST ] = playlist;
MAP_MAIN_INTERFACES[ TAB_VIDEO ] = {};
MAP_MAIN_INTERFACES[ TAB_QUEUE ] = queue;
MAP_MAIN_INTERFACES[ TAB_FILTER ] = {};
MAP_MAIN_INTERFACES[ TAB_SETTINGS ] = {};

search.selections = new Selectable( "app-result-container", ".app-result", {activeClass: "app-result-active"} );
search.suggestions = new SearchSuggestions( "app-search-suggestions-container", {
			activeClass: "app-search-suggest-active",
			suggestClass: ".app-search-suggestion",
			addClass: "app-search-suggestion notextflow",
			suggestAction: function( value, idx ) {
			searchIt( value );
			
			}
		}
);
search.ytSuggestions = new YouTubeSuggestions( "app-search-box", {throttle: 300, handler: function( data ) {
		if( data && data[1] ) {
		search.suggestions.newSuggestions( data[1] );
		}
	}});
	
search.history = new History( 20 );
search.main = new Search( "app-result-container", {addClass: "notextflow app-result"});

search.menu.onmenuclick = function( menuID ) {
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions[ menuID ] );
search.selections.clearSelection();
};

playlist.menu.onmenuclick = function( menuID ) {
playlist.selections.applyTo( playlist.main.getContainer(), playlist.menu.orderedActions[ menuID ] );
	
	if( menuID == 3 ) {
	playlist.selections.clearSelection();
	}
	else if( menuID >= 4 ) {
	playlist.main.render();
	}
};

queue.menu.onmenuclick = function( menuid ) {
	switch( menuid ) {
	case QUEUE_BUTTON_QUEUE_REMOVE:
	
	break;
	
	case QUEUE_BUTTON_SORT_REVERSE:
	
	break;
	case QUEUE_BUTTON_SORT_ALPHA:
	
	break;
	case QUEUE_BUTTON_SORT_RANDOM:
	
	break;
	}
queue.selections.clearSelection();
};

search.history.onremoveentry = function(){
$( ".app-recent-search", $( "#app-search-right" )[0] ).last().remove();
};

search.history.onnewentry = function( entries, newentries ) {
var entry = newentries[0], img = SEARCH_HISTORY_TYPE[entry.type],
	query = entry.query, results = entry.results, elm;
	
elm = $( 	"<div onclick=\"search.history.ignore(); search.main.search( '"+entry.type+
		"', '"+query.addSlashes("'").htmlEncode()+
		"');\" style=\"display: none;\" class=\"app-recent-search\">"+
		query+" ( <img src=\"images/"+img+
		"\" /> "+results+" )</div>" );
		
$( "#app-recent-searches-header" ).after( elm );
elm.fadeIn( 2100 );
};

search.main.onbeforesearch = function( query, type){
document.getElementById( "app-search-info" ).innerHTML = "";
$('#app-search-submit')[0].src = "images/search-ajax2.gif";
search.suggestions.hide();
};

search.main.onaftersearch = function( query, type, results ){
$('#app-search-submit')[0].src = "images/magnifier.png";
$('#app-search-box').val( "" ).focus().blur();

search.history.add( {
	query: query,
	type: type,
	results: results
	});
};

search.selections.onselect = function( selection ) {
updateSelection( selection && selection.length || 0 );
	if( selection && selection.length ) {
	search.menu.enable( "all" );
	}
	else {
	search.menu.disable( "all" );
	}

};

playlist.selections.onselect = function( selection ) {
updateSelection( selection && selection.length || 0 );
	if( selection && selection.length ) {
	playlist.menu.enable( "all" );
	}
	else {
	playlist.menu.disable( "all" );
	}
};

playlist.main.onupdate = function( songList, hashList, curSongHash, selections ){
var song, i, songTimeFormatted,
	l = hashList.length, str = [], hash, curh = 0, songIdx = -1, songObj;

selections.sort( SORT_NUMBER_ASC );

	for( i = 0; i < l; ++i ) {
	hash = hashList[ i ];
	song = songList[ hash ];
	
	songTimeFormatted = song.pTimeFmt || ( song.pTime && util.toTimeString( song.pTime ) ) || "";
	song.pTimeFmt = songTimeFormatted;
	
		if( hash === curSongHash ) {
		songIdx = i;
		songObj = song;
		
		}
	
	str.push( 	"<div class=\"app-song-container\" style=\"position: absolute;top:"+( PLAYLIST_ITEM_HEIGHT * i )+"px;\">",
			"<div id=\"app-song-"+i+"\" class=\"app-song",
			hash === curSongHash ? " app-playing" : "",
			selections.bSearch( i ) > -1 ? " app-song-active" : "",
			"\"><span class=\"app-song-name notextflow\">"+( i + 1 )+". " + song.name.htmlEncode() + "</span>",
			"<span class=\"app-song-time\">" + songTimeFormatted + "</span>",
			"</div></div>" );
	
	}


$( "#playlist" ).html( str.join( "" ) );
playlist.main.onchange.call( playlist, songObj, songIdx );
};

playlist.main.onchange = function( songObj, songIdx ) {
	if( songIdx < 0 )
	return;
	
$( ".app-playing", document.getElementById("playlist") ).removeClass( "app-playing" );
$( "#app-song-"+songIdx ).addClass( "app-playing" );
playlist.songDisplay.newTitle( "" + ( songIdx + 1 ) + ". " + songObj.name ).beginMarquee();
};


		
search.main.addType( "youtube", 
	function( query ) {
	var self = this, jsonp;

	jsonp = new JSONP( "http://gdata.youtube.com/feeds/api/videos", { 
				callbackP: "callback",

				timeout: 30,

				callback: function( jsonpad ) {
				var results = [], feed, title = jsonpad.feed.title.$t.substr( 31 ),
					i, l = 0;

				feed = jsonpad.feed.entry || null;

					if( feed && ( l = feed.length ) ) {

						for( i = 0; i < l; ++i ) {
						results.push( { 
							url: "youtube"+feed[i].link[0].href.match( /v=([0-9A-Za-z_-]{11})/ )[1], 
							name: feed[i].title.$t,
							pTime: feed[i].media$group.yt$duration.seconds
							});
						}
					}


				document.getElementById( "app-search-info" ).innerHTML = "Found " + l + " results for <b>" + title + "</b> when searching youtube" ;
				self.addResults.call( self, results, query, "youtube" );
				},

				params: {
					"restriction": playlist.ip,
					"format": 5,
					"q": query,
					"orderby": "relevance",
					"max-results": "50",
					"alt": "json-in-script"
				}
		});
	jsonp.execute();
});

search.main.addType( "mp3", 
		function( query ){
		var self = this;
		
		$.ajax({
		data: {query: query},
		datatype: "json",
		url: "ajax/search.php",
		method: "GET",
		success: function( feed ) {
		var results = [], feed, title = query,
			i, l = 0;
			

			if( feed && ( l = feed.length ) ) {

				for( i = 0; i < l; ++i ) {
					results.push( { 
					url: feed[i].url, 
					name: feed[i].title
					});
				}
			}

		document.getElementById( "app-search-info" ).innerHTML = "Found " + l + " results for <b>" + title + "</b> when searching MP3" ;
		self.addResults.call( self, results, query, "mp3" );
		},

		error: function(){
		document.getElementById( "app-search-info" ).innerHTML = "Found 0 results for <b>" + title + "</b> when searching MP3" ;
		self.addResults.call( self, [] );
		}
	});
});



$("#app-search-box").bind( "keyup", function( e ) {

	if( e.which === 13 ) {
	this.value = search.suggestions.getActiveSuggestion() || this.value;
	return searchIt( this.value );
	}

});

$("#app-search-submit").bind( "click", function( e ) {
searchIt( $("#app-search-box").val() );
});


$( "#app-result-container" ).delegate( ".app-result", "dblclick", function(){
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions["0"]);
});

$( "#playlist" ).delegate( ".app-song", "dblclick", function(e) {
var id = this.id, hash;
hash = playlist.main.getHashByIndex( +( id.substr( id.lastIndexOf( "-" ) + 1 ) ) );
playlist.main.changeSong( hash );
});

$( "#skipbut" ).click( function() {
playlist.main.next();
});

$( "#prevbut" ).click( function() {
playlist.main.prev();
});

$( ".menul-select-all" ).click( function() {
var curInterface = MAP_MAIN_INTERFACES[ tabs.activeTab ];

	if( curInterface.selections ) {
	curInterface.selections.all( curInterface.main.getContainer().length );
	}
});

$( ".menul-invert" ).click( function() {
var curInterface = MAP_MAIN_INTERFACES[ tabs.activeTab ];
	if( curInterface.selections ) {
	curInterface.selections.invert( curInterface.main.getContainer().length );
	}
});

(function(){
var $elms = $( ".menul-save").add( ".menul-load"), input = document.createElement("input"),
	div = document.createElement("div"), styles = div.style, audio = document.createElement( "audio" ),
	c, localfile = !!( window.URL || window.webkitURL || null ), key, missingFeatures = 0, featureDescriptions = [], str = "", saved,
	classn = " app-action-disabled", disabled = " disabled=\"disabled\"", appDataSave = {};
	
	
features.mp3 = false;
features.wav = false;
features.ogg = false;
features.readFiles = false;
features.dragFiles = false;

	if ( window.localStorage ) {
	appDataSave = storage.get("appData") || {};
	classN = "";
	disabled = "";
	features.localStorage = true;
			
	} else {
	features.localStorage = false;
	}
	
	if( "webkitdirectory" in input ||
		"directory" in input ||
		"mozdirectory" in input ) {
	
	features.directories = true;
	}
	else {
	$( ".menul-folder").addClass( "app-action-disabled" );
	features.directories = false;	
	}
	
	if( "textShadow" in styles &&
		"borderRadius" in styles &&
		"boxShadow" in styles ) {
	features.graphics = true;	
	}
	else {
	features.graphics = false;
	}
	
	if( typeof FileReader == "function" && new FileReader().readAsBinaryString ) {
	features.readFiles = true;
	}
	
	if ( "files" in input && ( "ondrop" in input || ( !input.setAttribute("ondrop", "") && typeof input["ondrop"] == "function" ) ) ) {
	features.dragFiles = true;
	}
	
	if( audio && typeof audio.canPlayType == "function" && localfile && features.readFiles ) {
		features.mp3 = !!( audio.canPlayType( "audio/mp3" ).replace( /no/gi, "" ) );
		features.wav = !!( audio.canPlayType( "audio/ogg" ).replace( /no/gi, "" ) );
		features.ogg = !!( audio.canPlayType( "audio/wav" ).replace( /no/gi, "" ) );	
	}
	
	
	$( ".menul-load" ).bind( "click" , function(){
	var playlists = window.localStorage && storage.get( "PlaylistJSON" ) || {}, key, data = [], playl, $l;

		for( key in playlists ) {
		data.push( {time: playlist.getTotalTime( playlists[key] ), name: key, length: playlists[key].length, load: "<span class=\"app-clickable menul-load\" onclick=\"playlist.loader.load('"+key.addSlashes("'")+"');\">Load</span>"});
		}

	$l = data.length;
	playl = $l === 1 ? "playlist" : "playlists";

	popup.open( 	"<h2 class=\"app-header-2\">Load playlist</h2>" +
			"<div id=\"app-playlists-table\"></div>" +
			"<div style=\"float:left;font-size:11px;\">"+( window.localStorage ? "Listing "+$l+ " "+ playl+" found in browser memory</div>" :
			"No access to browser memory") +
			"<div class=\"app-popup-solution\">" +
			"<div style=\"position:relative;width:114px;height:30px;\">" +
			"<div id=\"app-proceed-load\" class=\"app-popup-button right\">Load from File</div>" +
			"<input type=\"file\" onmouseover=\"$(this.previousSibling).addClass('app-popup-button-active');\""+
			" onmouseout=\"$(this.previousSibling).removeClass('app-popup-button-active');\" style=\"width:114px;height:30px;\"" +
			" class=\"hidden-file-input-hack\" onchange=\"playlist.loader.import( this.files[0] );\" />" +
			"</div></div>" );	

	new Table( "app-playlists-table", nodecache, {
			classPrefix: "app-feature",
			captions: { 
				name: "Name",
				length: "Track amount",
				time: "Total playtime",
				load: ""
			}
		}
	).addData( data );

});

	$( ".menul-save" ).bind( "click", function(){


	popup.open( "<h2 class=\"app-header-2\">Save playlist</h2>" +
			"<div class=\"app-bread-text app-form-container\">" +
			"<input type=\"text\" id=\"playlist-name\" spellcheck=\"false\" autocomplete=\"off\"" +
			" value=\""+(appDataSave.playlistName || "Playlist Name")+"\" class=\"app-bread-" +
			"text app-popup-input\"></div>" +
			"<div style=\"margin-top: 7px\"><input "+(!window.localStorage || appDataSave.saveMethod == "file" ? "checked ":"")+"type=\"radio\" name=\"savetype\" id=\"app-save-file\">" +
			"<label for=\"app-save-file\">Save as file</label>" +
			"<input type=\"radio\""+disabled+" "+(window.localStorage && ( appDataSave.saveMethod == "mem" || !appDataSave.saveMethod ? "checked ":"" ))+
			"name=\"savetype\" id=\"app-save-memory\">" +
			"<label for=\"app-save-memory"+classN+"\">Save in browser memory</label></div>" +
			"<div class=\"notextflow\" id=\"app-popup-message\"></div> " +
			"<div class=\"app-popup-solution\"><div id=\"app-proceed-save\" class=\"app-popup-button\">Save Playlist</div></div>",
			400,
			155 );
	});

	$( "#app-proceed-save" ).live( "click", function(){
	var name = $( "#playlist-name"), nam;
		if( !( nam = name[0].value ) ) {
		name.focus();
		return this;
		}
		if( $( "#app-save-file")[0].checked  ) {
		playlist.saver.export( nam, playlist.main.toArray() );
		}
		else {
			if( window.localStorage ) {
			playlist.saver.save( nam, playlist.main.toArray() );
			}
		}
	});
	
	featureDescriptions.push({ desc: "Play MP3 files located on your computer", name: "Local MP3", enabled: ( !features.mp3 && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS ) },
			{ desc: "Play OGG files located on your computer", name: "Local Ogg Vorbis", enabled: ( !features.ogg && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS ) },
			{ desc: "Play WAV files located on your computer", name: "Local WAVE", enabled: ( !features.wav && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Read local binary files", name: "File reader", enabled: ( !features.readFiles && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Drag &amp; Drop local audio files", name: "Drag &amp; Drop files", enabled: ( !features.dragFiles && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Save and load playlists", name: "Local storage", enabled: ( !features.localStorage && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Add entire directories of local files at once", name: "Directories", enabled: ( !features.directories && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Better graphics, such as shadows and rounded corners", name: "CSS3 Graphics", enabled: ( !features.graphics && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  } );	


	if( missingFeatures === 0 || appData.lowFeatures ) {
	return;
	}

appSetData( "lowFeatures", true );

popup.open( "<h2 class=\"app-header-2\">Browsers features missing:</h2><div id=\"" +
		"app-feature-table\"></div><div style=\"margin-top:20px;font-size:11px;\">"+
		"Some features aren't supported by your browser, perhaps it's time to try " +
		"<a href=\"http://www.google.com/chrome/\" target=\"_blank\">Google Chrome?</a>"+
		"</div>" );
		
		
	
new Table( "app-feature-table", nodecache, {
		classPrefix: "app-feature",
		captions: { 
			name: "Feature",
			desc: "Description",
			enabled: "Supported"
		}
	}
).addData( featureDescriptions );



})()

playlist.main.render();

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
    return false;
    })
    .bind("selectstart", function(){
    return false;
    });
    
   

$( "#app-loader").remove();
$( "#app-container" ).show();
tabs.selectTab( tabs.getTab( TAB_PLAYLIST ) );



//<input class=\"app-popup-close\" type=\"button\" value=\"close\"/>" );