var search = search || {};

search.infoText = "No search results";
search.ip = __IP_GET__();
search.placeholder = "Search";

new InputPlaceholder( "app-search-box", {text: search.placeholder, style: {color: "#999999"}});

search.historyTypes = {
	"youtube":"menur-youtube",
	"mp3":"menur-mp3"
};

search.validate = function( query ) {

	if( !query || query == search.placeholder ){
	return true;
	}

var type = jQuery( "#app-youtube-mode")[0].checked ? "youtube" : "mp3";
search.main.search( type, query );
};

search.menu = new ActionMenu( "search-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "search"
}).activate( "none" );

search.menu.orderedActions = {
	"0":	function( songs ) {
		var jQueryl = songs.length, newSongs = playlist.main.add( songs );
			if( newSongs.length) {
			playlist.main.changeSong( newSongs[0]  );
			}
		},
	"1":	function( songs ) {
		download.main( songs[0] );
		},
	"2":	function( songs ) {
		playlist.main.add( songs );
		}
};
// Previous object mappings, must match :)
search.menu.actionsMap = {
	play: 0,
	download: 1,
	addToPlaylist: 2
};

search.videoDataById = function( id, fn ){
	if( /[0-9a-zA-Z-_]{11}/.test( id ) && id.length === 11 ) {

	jQuery( "#app-search-info" ).html( "Loading "+id+"..." );
	var jsonp = new JSONP( "http://gdata.youtube.com/feeds/api/videos/"+id, {
		callbackP: "callback",
		
		timeout: 2,
		
		callback: function( jsonpad ) {
		var results = [];
			if( jsonpad ) {
			var entry = jsonpad.entry;
	
				if( entry ) {

					results.push( { 
						url: "youtube"+entry.link[0].href.match( /v=([0-9A-Za-z_-]{11})/ )[1], 
						name: entry.title.$t,
						pTime: entry.media$group.yt$duration.seconds,
						pTimeFmt: util.toTimeString( entry.media$group.yt$duration.seconds )
						});
				}
			
			}
			
			if( tabs.activeTab == tabs.search ) {
			jQuery( "#app-search-info").html( search.infoText || "" );
			}
			else {
			jQuery( "#app-search-info").html( "" );
			}
			
			if( results.length ) {
			fn( results );
			}
		},
		
		params: {
		"alt": "json-in-script"
		}
	
		});
		
	jsonp.execute();
	}
};

search.selections = new Selectable( "app-result-container", ".app-result-tbody-tr", {activeClass: "app-result-active"} );

search.selections.onscroll = function( node ){
util.scrollIntoView.alignMiddle( node, document.getElementById( "app-result-container") );
};

search.suggestions = new SearchSuggestions( "app-search-suggestions-container", {
			activeClass: "app-search-suggest-active",
			suggestClass: ".app-search-suggestion",
			addClass: "app-search-suggestion notextflow",
			suggestAction: function( value, idx ) {
			search.validate( value );
			
			}
		}
);

search.suggestions.onsuggest = function( elm ) {
var pos = jQuery( "#app-search-box-container" ).offset();

var left = pos.left, top = pos.top;

elm.style.left = left + "px";
elm.style.top = ( top + 20 )+ "px";

};

search.ytSuggestions = new YouTubeSuggestions( "app-search-box", {
	throttle: 300,
	handler: function( data ) {
		var arr = data && data[1] || [], query = data && data[0] || "";
		search.suggestions.newSuggestions( arr, query );
		}
	}
);
	
search.history = new History( 10 );
search.main = new Search( "app-result-container", {addClass: "notextflow app-result"});

search.menu.onmenuclick = function( menuID ) {
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions[ menuID ] );
};

search.history.onremoveentry = function(){
jQuery( ".app-recent-search", jQuery( "#app-menu-right" )[0] ).last().remove();
window.__YTPLACEMENT();
};

search.history.onnewentry = function( entries, newentries ) {
var i, l = newentries.length,
	entry, img, query, 
	results, elm;
	
	for( i = 0; i < l; ++i ) {
	entry = newentries[i];
	img = search.historyTypes[entry.type];
	query = entry.query;
	results = entry.results;
	elm = jQuery( 	"<li onclick=\"search.history.ignore(); search.main.search( '"+entry.type+
		"', '"+query.addSlashes("'").htmlEncode()+
		"');\" style=\"display: block;\" class=\"app-recent-search notextflow "+img+"\">"+
		query+"</li>" );
	jQuery( "#app-recent-searches-header" ).after( elm );
	}

window.__YTPLACEMENT(); // Realigns the youtube player as its position needs to be updated
window.storage.set( "recentSearch", entries ); // Store recent searches
};


jQuery( window ).bind( "youtubeready", // Recover recent searches when both players are ready
	function(e){
	var recentSearches = window.storage.get( "recentSearch" ) || null;
		if( recentSearches && recentSearches.length ) {
		window.search.history.add( recentSearches );
		}
	}
);

search.main.onbeforesearch = function( query, type){
jQuery('#app-search-submit')[0].src = "images/search-ajax2.gif";
search.suggestions.hide();
	if( tabs.activeTab !== tabs.search ) {
	tabs.selectTab( tabs.getTab( tabs.search ) );
	}
document.getElementById( "app-search-info" ).innerHTML = "Loading...";
};

search.main.onaftersearch = function( query, type, results ){
jQuery('#app-search-submit')[0].src = "images/magnifier.png";
jQuery('#app-search-box').val( "" ).focus().blur();
search.selections.max = results;
search.history.add( {
	query: query,
	type: type,
	results: results
	});
search.suggestions.hide();
};



search.main.onsearchresults = function( results, query ) {

	new Table( "app-result-container", nodecache, {
			classPrefix: "app-result",
			captions: { 
				"name": "",
				"pTimeFmt": ""
			}
		}
	).addData( results, {
			"name": function( rowdata ){
			return "<div title=\"Play\" class=\"app-hover hover-play\"></div><div title=\"Add to playlist\" " +
				"class=\"app-hover hover-add\"></div><div class=\"notextflow app-row-result-name\">"+rowdata.name+"</div>";
			},
			"pTimeFmt": function( rowdata ){
			return "<div class=\"notextflow app-row-result-time\">"+(rowdata.pTimeFmt || "N/A")+"</div>";
			}
		}
	);
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
							pTime: feed[i].media$group.yt$duration.seconds,
							pTimeFmt: util.toTimeString( feed[i].media$group.yt$duration.seconds )
							});
						}
					search.infoText = "Found " + l + " results for <b class=\"notextflow app-max-word-length\">" + title + "</b> when searching youtube";
					} else {
					search.infoText = "No search results";
					}


				document.getElementById( "app-search-info" ).innerHTML = search.infoText;
				self.addResults.call( self, results, query, "youtube" );
				},

				params: {
					"restriction": search.ip,
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
			search.infoText = "Found " + l + " results for <b class=\"notextflow app-max-word-length\">" + title + "</b> when searching MP3";
			} else {
			search.infoText = "No search results";
			}
		
		document.getElementById( "app-search-info" ).innerHTML = search.infoText;
		self.addResults.call( self, results, query, "mp3" );
		},

		error: function(){
		document.getElementById( "app-search-info" ).innerHTML = search.infoText = "No search results" ;
		self.addResults.call( self, [] );
		}
	});
});

/*
search.dragThrottleId = 0;

search.__mousemoveCreate = function( elm ){


	return function(e){
	
	
	
	
	
	};

};

search.stopDrag = function(e){};

search.startDrag = function( e ){
var mousemove = search.__mousemoveCreate( "elm" );

	$( document ).bind( "mousemove", function(e){
	
	};
};

*/

search.selections.onselect = function( selection ) {

var context = document.getElementById( "app-result-container" ),
	$elms = $( ".app-result-hover", context ),
	l = selection && selection.length || 0, idx;

updateSelection( l );
$elms.removeClass( "app-result-hover" );
$( ".app-hover", context ).css("visibility", "hidden");
window.clearTimeout( search.dragThrottleId );

	/*
	if( l === 1 ) {
	search.dragThrottleId = window.setTimeout( search.startDrag, 200 );
	}
	*/
	
	
	if( l ) {

		for( i = 0; i < l; ++i ) {
		$( ".app-hover", document.getElementById( "app-result-"+selection[i]) ).css("visibility", "visible");
		}
	search.menu.activate( "all" );
	}
	else {
	search.menu.activate( "none" );
	}

};

$( "#app-result-container").delegate( ".app-result-tbody-tr", "mouseenter mouseleave",
	function(e){
	var $this = $(this);
		if( $this.hasClass( "app-result-active" ) ) {
		return true;
		}

		if( e.type == "mouseenter" ){
		$this.addClass( "app-result-hover");
		$( ".app-hover", this ).css("visibility", "visible");
		}
		else {
		$this.removeClass( "app-result-hover");
		$( ".app-hover", this ).css("visibility", "hidden");
		}
	}
).delegate( ".app-result-tbody-tr", "dblclick",
	function(e){
	search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions["0"]);
	}
).delegate( ".hover-play", "mousedown",
	function(e){
		if( e.which !== 1 ) {
		return true;
		}
	var id = this.parentNode.parentNode.id;
	id = id.substr( id.lastIndexOf("-") + 1 );
	search.menu.orderedActions[ search.menu.actionsMap.play ]( [ search.main.getContainer()[id] ] );
	}
).delegate( ".hover-add", "mousedown",
	function(e){
		if( e.which !== 1 ) {
		return true;
		}
	var id = this.parentNode.parentNode.id;
	id = id.substr( id.lastIndexOf("-") + 1 );
	search.menu.orderedActions[ search.menu.actionsMap.addToPlaylist ]( [ search.main.getContainer()[id] ] );
	}
);

$("#app-search-box").bind( "keyup",
	function( e ) {
		if( e.which === 13 ) {
		this.value = search.suggestions.getActiveSuggestion() || this.value;
		return search.validate( this.value );
		}
		else if( e.which === 27 ) {
		this.blur();
		}
	}
).bind("focus blur",
	function(e){
	var elm = document.getElementById("app-search-box-container");
		if(e.type=="focus"){
		elm.style.backgroundColor = "#EBF7FF";
		}else {
		elm.style.backgroundColor = "";
		}
	}
);



jQuery("#app-search-submit").bind( "click", function( e ) {
search.validate( $("#app-search-box").val() );
});


jQuery( "#app-mp3-mode").add("#app-youtube-mode").bind( "change",
	function(e){
	$( ".app-mode-label-selected").removeClass( "app-mode-label-selected" );
		if( $( "#app-youtube-mode")[0].checked ) {
		$( "#app-mode-youtube-label" ).addClass( "app-mode-label-selected" );
		}
		else {
		$( "#app-mode-mp3-label" ).addClass( "app-mode-label-selected" );		
		}
	}
);

search.hijackCopyPaste = (function(){
var inProgress = false;
	return function( e ) {
	var v = String.fromCharCode(e.which ), textarea;

		if( ( v == "v" || v == "V" ) && e.ctrlKey && !inProgress ) {
		inProgress = true;
		textarea = document.createElement("input");
		textarea.type = "text";
		textarea.setAttribute("style", "opacity:0;-moz-opacity:0;filter: alpha('opacity=0');" );
		document.body.appendChild( textarea );
		textarea.focus();

			window.setTimeout( function(){
			var value = textarea.value;
			value = value.replace( /^[^v]+v.([A-Za-z0-9-_]{11}).*/, "$1" );

			search.videoDataById( value || "", function( songs ) {
				playlist.main.add( songs );
				});
			textarea.blur();
			textarea.parentNode.removeChild( textarea );
			inProgress = false;
			}, 320 )
		}
	}
})();





$(document).bind("keydown", search.hijackCopyPaste );