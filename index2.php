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
<script type="text/javascript" src="js/jquery.js"></script>
<script type="text/javascript" src="js/musaprojekti.util.js"></script>
<script type="text/javascript" src="js/musaprojekti.klassit.js"></script>

</head>
<body class="unselectable" >

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
					<li class="menul-sub-title">View</li>
					<div id="app-tabs-container">
					 	<div id="app-changes-container">

					 	</div>
					</div>
					<li class="menul-sub-title">Action</li>
					<li class="app-action-tab menul-save">Save playlist</li>
					<li class="app-action-tab menul-load">Load playlist</li>
					<li class="app-action-tab menul-folder">Add a folder</li>
					<li class="app-action-tab menul-select-all">Select all</li>
					<li class="app-action-tab menul-invert">Invert selection</li>
					
					<li class="menul-sub-title">Selection <div id="app-selection-count">0 items</div></li>
					<ul class="app-action-tabs-container" id="search-action-menu">
						<li class="app-action-tab menul-play">Play</li>
						<li class="app-action-tab menul-download">Download</li>
						<li class="app-action-tab menul-playlist-add">Add to playlist</li>
						<li class="app-action-tab menul-queue-add">Add to queue</li>
					</ul>
					<ul class="app-action-tabs-container" id="playlist-action-menu">
						<li class="app-action-tab menul-play">Play</li>
						<li class="app-action-tab menul-download">Download</li>
						<li class="app-action-tab menul-queue-add">Add to queue</li>
						<li class="app-action-tab menul-playlist-delete">Delete</li>
						<li class="app-action-tab menul-reverse">Sort by reverse</li>
						<li class="app-action-tab menul-alpha">Sort by name</li>
						<li class="app-action-tab menul-shuffle">Sort by random</li>

					</ul>
					<ul class="app-action-tabs-container" id="queue-action-menu">
						<li class="app-action-tab menul-queue-remove">Remove</li>
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
				<br class="clear" />
				<br class="clear" />
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
					<div id="playercontrols">
						<div style="float:left;width:115px;">
							<div title="Reset / Previous" class="bwpic blbuttonhov unselectable" id="prevbut"></div>
							<div title="Play / Begin" class="playpic blbuttonhov unselectable" id="playbut"></div>
							<div title="Pause" class="pausepic blbuttonhov unselectable" id="pausebut"></div>
							<div title="Stop" class="stoppic blbuttonhov unselectable" id="stopbut"></div>
							<div title="Skip / Next" class="fwpic blbuttonhov unselectable" id="skipbut"></div>
						</div>
						<div style="float:right;width: 143px; padding-top: 3px;">
							<span id="volcontrol"></span><div class="unselectable" id="volumewrap">
								<div id="volumeindex" class="unselectable" style="left: -100%; "></div>
							</div>
						</div>
					</div>
				</div>
				<div id="app-header-main">
				</div>
			</div>
			<div id="app-content-holder">

				<div class="content" id="app-search-wrapper">
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
							<div id="app-result-container">							
							</div>
						</div>

			
					</div>
				</div>
				<div class="content" id="playlist"></div>
				<div class="content" id="video"></div>
				<div class="content" id="queue"></div>
				<div class="content" id="filter"></div>
				<div class="content" id="settings"></div>
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
</body>
</html>