<?php
header('Content-Type: text/html; charset=iso-8859-1');
require( "scripts.public.php" );
?>
<!DOCTYPE HTML>
<html>
<head>
<link rel="shortcut icon" href="kivakuva3.png" />
<link rel="stylesheet" href="css/app-css-public.css" />
<meta http-equiv="X-UA-Compatible" content="chrome=1" />
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<meta name="description" content="noindex, no follow" />
<meta name="robots" content="noindex, nofollow" />
<title>Musaprojekti</title>
</head>
<body>
<!--
<div id="apm" style="position:absolute;z-index:100000;opacity:1;top:0px;left:15px;width:200px;height:75px;text-shadow:1px 1px 3px #333333;color:#FFFFFF;font-size:25px;">
APM: <span id="apm-total">00.00</span>
</div>
-->
<div id="wrapper">
	<div id="app-youtube-audio-0" class="app-youtube-audio hidden"></div>
	<div id="app-youtube-audio-1" class="app-youtube-audio hidden"></div>
	<div id="app-players-container">
		<div id="jplaycon"></div>
		<div id="jplayconres"></div>
		<div id="app-html5-audio-0"></div>
		<div id="app-html5-audio-1"></div>		
	</div>	
<div id="app-search-suggestions-container"></div>
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
					<li class="menul-sub-title"><span id="tooltip-view">View</span> <div class="app-sub-title-addon" id="app-current-tab">Playlist</div></li>
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
					<li class="app-action-tab menul-crossfade">Crossfading</li>
					
					<li class="menul-sub-title"><span id="tooltip-selection">Selection</span> <div class="app-sub-title-addon" id="app-selection-count">0 items</div></li>
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
				<ul class="app-action-tabs-container">
					<li class="menul-sub-title" id="app-recent-searches-header">Recent searches</li>
					<li class="menul-sub-title" style="margin-top: 15px;">Video</li>
					<div id="app-video-container" style="height: 150px;position:relative;">
					<div id="app-video-overlay" style="height: 1px; width: 150px; position:absolute;top:0px;left:0px;background-color:#FFFFFF;z-index:2000;"></div>
					</div>
					
					<li class="app-action-tab menur-fullscreen" id="app-fullscreen" style="display:none;width: 60px;margin: 10px auto;">Fullscreen</li>
				</ul>
			</div>
		
		</div>
		<div id="app-middle">
		   <div id="app-inner">			
			<div id="app-player-panel-container">
				<div id="app-headercontrols">
					<div id="app-songinfo">
						<span id="curplaycontainer">
							<span id="app-current-playtime">00:00</span>
							<span style="font-weight:bold;font-size:13px;margin:0px 1px">/</span>
							<span id="app-total-playtime">00:00</span>
						</span>
						<span id="songstatuscontainer">
						<span id="songstatus"></span>
						</span>
					</div>
					<div class="notextflow" id="app-song-progress-container">
						<div id="app-song-progress"></div>
						<div id="app-song-display-container">
						<div id="app-song-display"></div>
						</div>
					</div>
					<div id="app-player-panel-controls">
						<div style="float:left;width:250px;margin-top:8px;">
							<div class="app-panel-control" id="app-panel-play"></div>
							<div class="app-panel-control" id="app-panel-pause"></div>
							<div class="app-panel-control" id="app-panel-previous"></div>
							<div class="app-panel-control active" id="app-panel-stop"></div>
							<div class="app-panel-control" id="app-panel-next"></div>
						</div>
						<div id="app-volume-controls">
							<div id="app-volume-percentage"></div>
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
					<div id="app-search-box-container">
						<img id="app-search-submit" src="images/magnifier.png">
						<input id="app-search-box" autocomplete="off" spellcheck="false" />
					</div>
					<div id="app-search-modes-container">
						<span style="display:inline-block; margin-right: 5px;">From: </span>
						<input id="app-youtube-mode" type="radio" name="smode" checked>
						<label id="app-mode-youtube-label" class="app-mode-label app-mode-label-selected" for="app-youtube-mode">Youtube</label>
						<input id="app-mp3-mode" type="radio" name="smode">
						<label id="app-mode-mp3-label" class="app-mode-label" for="app-mp3-mode">MP3</label>
					</div>
	
				</div>
			</div>
			<div id="app-content-holder" style="background-color: #ffffff;">

				<div class="content" id="app-search-wrapper">
					<div id="app-result-container" class="songs-list-container"></div>
				</div>
				<div class="content songs-list-container" id="app-playlist-container"></div>
			</div>

			<div id="app-search-info"></div>

		   </div>
		</div>
		<div class="clear"></div>
		</div>
	
		
</div>
<script type="text/javascript">
var __PROJECT__TITLE = (function(){var t = "<?php echo $PROJECT_TITLE; ?>"; return function(){return t;};})();
var __IP_GET__ = (function(){var __IP_ADDRESS__ = "<?php echo $_SERVER['REMOTE_ADDR']; ?>";return function(){return __IP_ADDRESS__;};})();
var script = document.createElement("script");
script.type = "text/javascript";
script.src = "<?php echo $script ?>";
document.getElementsByTagName("head")[0].appendChild(script);
</script>
</body>
</html>