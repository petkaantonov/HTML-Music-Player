var nodecache = new NodeCache(), tabs, playlist = {}, search = {}, queue = {}, scrolls, features = {},
	featureDescriptions = {};

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

function saveScrolls(){

}

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
		playlist.animateChangesPos( "+"+$l );
		playlist.main.add( songs ).changeSong( playlist.main.getHashByIndex( playlist.main.length - $l ) );
		},
	"1":	function( songs ) {
		download.main( songs[0] );
		},
	"2":	function( songs ) {
		playlist.main.add( songs );
		playlist.animateChangesPos( "+"+songs.length );
		},
	"3":	function( songs ) {
		var $l = songs.length;	
		playlist.main.add( songs )
		queue.main.add( songs );
		playlist.animateChangesPos( "+"+$l );
		queue.animateChangesPos( "+"+$l );
		}
};

new InputPlaceholder( "app-search-box", {text: QUERY_PLACEHOLDER, style: {color: "#999999", fontStyle: "italic"}});

playlist.songDisplay = new SongDisplay( "app-song-display" );
playlist.selections = new Selectable( "playlist", ".app-song", {activeClass: "app-song-active"} );
playlist.main = new Playlist( playlist.selections, {songList: [{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"}]} );
playlist.dragging = new DraggableSelection( "playlist", playlist.selections, playlist.main, PLAYLIST_ITEM_HEIGHT, ".app-song-container" );

playlist.menu.orderedActions = {
	"0":	function( songs ) {
		playlist.main.changeSong( songs[0] );
	},
	"1":	function( songs ) {
		download.main( songs[0] );
	},
	"2":	function( songs ) {
		queue.main.add( songs );
		queue.animateChangesPos( "+"+songs.length );
	},
	"3":	function( songs ) {
		playlist.main.remove( songs );
		playlist.animateChangesNeg( "-"+songs.length );
	},
	
	"4":	createSorter( playlist.main._hashList, "reverse" ),

	"5":	createSorter( playlist.main._hashList, "sort", SORT_ALPHA_ASC( playlist.main["_songList" ], "name" ) ),
	
	"6":	createSorter( playlist.main._hashList, "shuffle" )
		
};

playlist.animateChangesPos = function( count ) {
animateChanges({color: POSITIVE, count: count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_POSITIVE_END});
};

playlist.animateChangesNeg = function( count ) {
animateChanges({color: NEGATIVE, count: count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_NEGATIVE_END});
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
		url: "ajaxsearch.php",
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
var $elms = $( ".menu-save").add( ".menu-load"), input = document.createElement("input"),
	div = document.createElement("div"), styles = div.style, audio = document.createElement( "audio" ),
	c
	
features.mp3 = false;
features.wav = false;
features.ogg = false;
features.readFiles = false;
features.dragFiles = false;

	if ( window.localStorage ) {
	features.localStorage = true;
	
	} else {
	features.localStorage = false;
	$elms.addClass( "app-action-disabled" );
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
	
	if( audio && typeof audio.canPlayType == "function" ) {
	features.mp3 = !!( audio.canPlayType( "mp3" ).replace( /no/gi, "" ) );
	features.wav = !!( audio.canPlayType( "ogg" ).replace( /no/gi, "" ) );
	features.ogg = !!( audio.canPlayType( "wav" ).replace( /no/gi, "" ) );	
	}
	
	if( typeof FileReader == "function" && new FileReader().readAsBinaryString ) {
	features.readFiles = true;
	}
	
	if ( "files" in input && document.createEvent && "dataTransfer" in document.createEvent( "MouseEvents" ) ) {
	features.dragFiles = true;
	}


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

