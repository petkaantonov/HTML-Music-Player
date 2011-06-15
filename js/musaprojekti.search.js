var search = search || {};

search.ip = __IP_GET__();
search.placeholder = "Enter search term";

new InputPlaceholder( "app-search-box", {text: search.placeholder, style: {color: "#999999", fontStyle: "italic"}});

search.historyTypes = {
	"youtube":"ytsmall.png",
	"mp3":"mp3.png"
};

search.validate = function( query ) {

	if( !query || query == search.placeholder ){
	return true;
	}

var type = $( "#app-youtube-mode")[0].checked ? "youtube" : "mp3";
search.main.search( type, query );
};

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
		}
};

search.selections = new Selectable( "app-result-container", ".app-result", {activeClass: "app-result-active"} );

search.selections.onscroll = function( node ){
filter.scrollIntoView( node, node.parentNode );
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

search.ytSuggestions = new YouTubeSuggestions( "app-search-box", {throttle: 300, handler: function( data ) {
		if( data && data[1] ) {
		search.suggestions.newSuggestions( data[1] );
		}
	}});
	
search.history = new History( 20 );
search.main = new Search( "app-result-container", {addClass: "notextflow app-result"});

search.menu.onmenuclick = function( menuID ) {
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions[ menuID ] );
};

search.history.onremoveentry = function(){
$( ".app-recent-search", $( "#app-search-right" )[0] ).last().remove();
};

search.history.onnewentry = function( entries, newentries ) {
var entry = newentries[0], img = search.historyTypes[entry.type],
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
search.selections.max = results;
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
	return search.validate( this.value );
	}

});

$("#app-search-submit").bind( "click", function( e ) {
search.validate( $("#app-search-box").val() );
});


$( "#app-result-container" ).delegate( ".app-result", "dblclick", function(){
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions["0"]);
});