var consoleLog;
try {
consoleLog = console.log.bind( console );
}
catch(e){
consoleLog = $.noop;
}