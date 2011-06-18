var tabs = tabs || {}, scrolls, captions;

captions = [ "Search results", "Playlist" ];

tabs = new Tabs( "app-tabs-container", nodecache, {
		holderClass: "content",
		contentHolder: "app-content-holder",
		classPrefix: "app-action",
		captions: captions
	}
);

tabs.search = 0;
tabs.playlist = 1;
tabs.video = 2;

tabs.captions = captions;

tabs.playlistScroll = 0;
tabs.searchScroll = 0;

tabs.interfaceMap = {};
tabs.interfaceMap[ tabs.search ] = search;
tabs.interfaceMap[ tabs.playlist ] = playlist;
tabs.interfaceMap[ tabs.video ] = {};

// Keeps track of the scroll values of given elements.
scrolls = new Scrolls( (function(){var r = {};
			r[ tabs.search] = "#app-result-container";
			r[ tabs.playlist] = "#app-playlist-container";
			return r;
			})());

// Get the scrolled value before switching tabs so the element isn't scrolled back to top when user returns	
tabs.onbeforetabselect = function( oldTab ) {
scrolls.calculate( oldTab );
};

tabs.ontabselect = function switchInterface( menuId ){
var key, n, menu, elms = $( ".menul-select-all" ).add( ".menul-invert" );

	if( tabs.interfaceMap[ menuId ].selections ) {

	elms.removeClass( "app-action-disabled" );
	}
	else {
	elms.addClass( "app-action-disabled" );	
	}

	for( key in tabs.interfaceMap ) {
	menu = tabs.interfaceMap[ key ].menu;
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
	
	if( menuId !== tabs.search ) {
	$( "#app-search-info").html("");
	}else {
	$( "#app-search-info").html( search.infoText );	
	}
// Restore the scrolled value for this tab
$( "#app-current-tab").html( tabs.captions[ menuId ] );
scrolls.restore( menuId );
};

$( tabs.getTab( tabs.search ) ).addClass("menul-search");
$( tabs.getTab( tabs.playlist ) ).addClass("menul-playlist");
$( tabs.getTab( tabs.video ) ).addClass("menul-video");

$( tabs.getTab() ).delegate( "li", "click", function(){
tabs.selectTab( this );
});

tabs.selectAllFromCurrent = function(){
var curInterface = tabs.interfaceMap[ tabs.activeTab ];

	if( curInterface.selections ) {
	curInterface.selections.all( curInterface.main.getContainer().length );
	}
	
return false;
}

tabs.selectInverseFromCurrent = function(){
var curInterface = tabs.interfaceMap[ tabs.activeTab ];
	if( curInterface.selections ) {
	curInterface.selections.invert( curInterface.main.getContainer().length );
	}
	
return false;
};

$( ".menul-select-all" ).click( tabs.selectAllFromCurrent );
$( ".menul-invert" ).click( tabs.selectInverseFromCurrent );