<?php
header('Content-Type: text/html; charset=iso-8859-1');
?>
<!DOCTYPE HTML>
<html>
<head>
<link rel="shortcut icon" href="kivakuva3.png" />
<link rel="stylesheet" href="css/main2.css?v=0.34" />
<meta http-equiv="X-UA-Compatible" content="chrome=1" />
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<meta name="description" content="noindex, no follow" />
<meta name="robots" content="noindex, nofollow" />
<title>Musaprojekti</title>
<script type="text/javascript">var __IP_GET__ = (function(){var __IP_ADDRESS__ = "<?php echo $_SERVER['REMOTE_ADDR']; ?>";return function(){return __IP_ADDRESS__;};})();</script>
<script type="text/javascript" src="js/jquery.js"></script>
<script type="text/javascript" src="js/jsonschema.js"></script>
<script type="text/javascript" src="js/musaprojekti.debug.js"></script>
<script type="text/javascript" src="js/musaprojekti.util.js"></script>
<script type="text/javascript" src="js/musaprojekti.klassit.js"></script>

</head>
<body class="unselectable" >
<!--
<div id="apm" style="position:absolute;z-index:100000;opacity:1;top:0px;left:15px;width:200px;height:75px;text-shadow:1px 1px 3px #333333;color:#FFFFFF;font-size:25px;">
APM: <span id="apm-total">00.00</span>
</div>
-->
<div id="wrapper">

<div id="app-loader">
	<div id="app-loading-container">
		<span id="app-load-text">
			<img onload="this.style.paddingRight = '10px';" src="images/app-load.gif" style="padding-right: 36px;" />Loading...
		</span>
		<noscript>
		<div id="noscript">
		This page requires JavaScript to be enabled, <br />
		enable javascript and <a href="">reload</a> the page. 
		</div>
		</noscript>
	</div>


</div>
		<div id="app-container">
		<div id="app-left">
			<div id="app-menu-left">
				<ul class="app-action-tabs-container" style="margin-left:12px;">
					<li class="menul-sub-title">View <div class="app-sub-title-addon" id="app-current-tab">Playlist</div></li>
					<div id="app-tabs-container">
					 	<div id="app-changes-container">

					 	</div>
					</div>
					<li class="menul-sub-title">Tracks</li>

					<li class="app-action-tab menul-save">Save</li>
					<li class="app-action-tab menul-load">Load</li>
					<li class="app-action-tab menul-folder">Add a folder</li>
					<li class="app-action-tab menul-select-all">Select all</li>
					<li class="app-action-tab menul-invert">Invert selection</li>
					<li class="app-action-tab menul-filter">Filter</li>
					
					<li class="menul-sub-title">Settings</li>
					<li class="app-action-tab menul-hotkeys">Hotkey setup</li>
					<li class="app-action-tab menul-features">Feature test</li>
					
					<li class="menul-sub-title">Selection <div class="app-sub-title-addon" id="app-selection-count">0 items</div></li>
					<ul class="app-action-tabs-container" id="search-action-menu">
						<li class="app-action-tab menul-play">Play</li>
						<li class="app-action-tab menul-download">Download</li>
						<li class="app-action-tab menul-playlist-add">Add to playlist</li>
					</ul>
					<ul class="app-action-tabs-container" id="playlist-action-menu">
						<li class="app-action-tab menul-play">Play</li>
						<li class="app-action-tab menul-download">Download</li>
						<li class="app-action-tab menul-playlist-delete">Delete</li>
						<li class="app-action-tab menul-clone">Clone</li>
						<li class="app-action-tab menul-reverse">Sort by reverse</li>
						<li class="app-action-tab menul-alpha">Sort by name</li>
						<li class="app-action-tab menul-shuffle">Sort by random</li>

					</ul>
				</ul>
			</div>
		</div>
		<div id="app-right">
			<div id="app-menu-right">
			</div>
		
		</div>
		<div id="app-middle">
		   <div id="app-inner">			
			<div id="playercontainer" class="unselectable">
				<div id="cfadecon" class="crossfadeinact">
				<div id="crossfadetoggle" title="Toggle Crossfading" style="float:left;">crossfade</div>
					<div class="cfadeseconds" title="Crossfade time between tracks in seconds">
						<span id="lesscross">&#x25C0;</span> 
						<span id="crossfadeval"></span> 
						<span id="morecross">&#x25B6;</span>
					</div>
				</div>
				<div id="modescon">
				<div id="repeat" title="Repeat" class="modediv repeatinactive"></div>
				<div id="shuffle" title="Shuffle" class="modediv shuffleinactive"></div>
				<div id="normal" title="Normal" class="modediv normalinactive"></div>
				</div>
				<br>
				<br>
				<div id="seektopointer" class="unselectable"></div>
				<div id="app-headercontrols">
					<div id="app-songinfo">
						<span id="curplaycontainer">
							<span id="curplaytime">00:00</span>
							<span style="font-weight:bold;font-size:13px;margin:0px 1px">/</span>
							<span id="totplaytime">00:00</span>
						</span>
						<span id="songstatuscontainer">
						<span id="songstatus"></span>
						</span>
					</div>
					<div class="msgcontainer notextflow" id="msgcontainer">
						<div class="playpercentage unselectable" id="playper">
							<div id="seekbar2"></div>
							</div>
						<div id="app-song-display-container">
						<div id="app-song-display"></div>
						</div>
					</div>
					<div id="app-player-controls">
						<div style="float:left;width:115px;">
							<div title="Reset / Previous" class="bwpic blbuttonhov unselectable" id="prevbut"></div>
							<div title="Play / Begin" class="playpic blbuttonhov unselectable" id="playbut"></div>
							<div title="Pause" class="pausepic blbuttonhov unselectable" id="pausebut"></div>
							<div title="Stop" class="stoppic blbuttonhov unselectable" id="stopbut"></div>
							<div title="Skip / Next" class="fwpic blbuttonhov unselectable" id="skipbut"></div>
						</div>
						<div id="app-volume-controls">
							<div id="app-volume-mute"></div>
							<div id="app-volume-slider-clickarea">
								<div id="app-volume-slider-wrap">
									<div id="app-volume-slider-knob"></div>
									<div id="app-volume-slider-bg"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div id="app-header-main">
				</div>
			</div>
			<div id="app-content-holder">

				<div class="content" id="app-search-wrapper" style="height:475px;">
					<div id="app-search-container">
						<div id="app-search-modes">
							Search from <input id="app-youtube-mode" type="radio" name="smode" checked /> <label for="app-youtube-mode">Youtube</label>
							<input id="app-mp3-mode" type="radio" name="smode"/> <label for="app-mp3-mode">MP3</label>
						</div>
					
						<div id="app-search-box-container">
							<div id="app-search-suggestions-container">
							</div>
							<img id="app-search-submit" src="images/magnifier.png">
							<input id="app-search-box" autocomplete="off" spellcheck="false" />		
						</div>
						<div id="app-search-info">
							
						</div>
					</div>
					<div id="app-search-content">
						<div id="app-search-right">
							<div id="app-recent-searches-header">Recent Searches</div>
						</div>
						<div id="app-search-left">
							<div id="app-result-container" class="songs-list-container">							
							</div>
						</div>

			
					</div>
				</div>
				<div class="content songs-list-container" id="playlist" style="height:475px;"></div>
				<div class="content" id="video"></div>
			</div>
			<div id="containplayers">
				<div class="disable-youtube-watch"></div>
				<div id="sinatuubi" class="youtubehide"></div>
				<div id="sinatuubires" class="youtubehideres"></div>
				<div id="jplaycon"></div>
				<div id="jplayconres"></div>
				<div id="html5audio"></div>
				<div id="html5audiores"></div>		
			</div>
		   </div>
		</div>
		<div class="clear"></div>
		</div>
		
		
</div>
<script type="text/javascript" src="js/musaprojekti.callit.js"></script>
<script type="text/javascript" src="js/musaprojekti.search.js"></script>
<script type="text/javascript" src="js/musaprojekti.playlist.js"></script>
<script type="text/javascript" src="js/musaprojekti.player.js"></script>
<script type="text/javascript" src="js/musaprojekti.filter.js"></script>
<script type="text/javascript" src="js/musaprojekti.features.js"></script>
<script type="text/javascript" src="js/musaprojekti.tabs.js"></script>
<script type="text/javascript" src="js/musaprojekti.hotkeys.js"></script>

</body>
</html>