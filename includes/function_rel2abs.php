<?php
function rel2abs($rel) {
$srv = $_SERVER['PHP_SELF'];
$srv = substr( $srv, 0, strrpos( $srv, "/" ) + 1 );

$base = "http://".$_SERVER['HTTP_HOST'].$srv;

    if( parse_url($rel, PHP_URL_SCHEME) != '' ) {
    	 return $rel;
	}
   
    
    if( $rel[0]=='#' || $rel[0]=='?' ) {
    	 return $base.$rel;
	}
   
    extract(parse_url($base));
 
    
    $path = preg_replace('#/[^/]*$#', '', $path);
 
    
    if( $rel[0] == '/' ) {
    	 $path = '';
	}
    
    $abs = "$host$path/$rel";
 
    
    $re = array('#(/\.?/)#', '#/(?!\.\.)[^/]+/\.\./#');
    for($n=1; $n>0; $abs=preg_replace($re, '/', $abs, -1, $n)) {}
   
    
    return $scheme.'://'.$abs;
}
?>