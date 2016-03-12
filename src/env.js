import $ from "lib/jquery";
require("lib/ua-parser");

const desktopOs = /^(CentOS|Fedora|FreeBSD|Debian|Gentoo|GNU|Linux|Mac OS|Minix|Mint|NetBSD|OpenBSD|PCLinuxOS|RedHat|Solaris|SUSE|Ubuntu|UNIX VectorLinux|Windows)$/;
var ua = $.ua;
var isDesktop = false;

if (ua.device && ua.device.type) {
    isDesktop = !/^(console|mobile|tablet|smarttv|wearable|embedded)$/.test(ua.device.type);
} else if (ua.cpu && ua.cpu.architecture) {
    isDesktop = /^(amd64|ia32|ia64)$/.test(ua.cpu.architecture);
} else if (ua.os && ua.os.name) {
    isDesktop = desktopOs.test(ua.os.name);
}

exports.isDesktop = function() {
    return isDesktop;
};

exports.isMobile = function() {
    return !isDesktop;
};
