import $ from "lib/jquery";
const touch = require("features").touch;
const domUtil = require("lib/DomUtil");
const GlobalUi = require("ui/GlobalUi");


function clicked(e) {
    var input = $(this).data("file_input");

    if (input.chooseDirectory && input.directory) {
        input.chooseDirectory();
    } else {
        input.click();
    }
}

function mousedowned(e) {
    e.preventDefault();
}

const clickedTouch = domUtil.tapHandler(clicked);

function createInput(atts) {
    var input = document.createElement("input");
    input.tabIndex = -1;
    atts = Object(atts);
    Object.keys(atts).forEach(function(key) {
        input[key] = atts[key];
    });
    $(input).css({
        position: "absolute",
        top: "-9999px",
        left: "-9999px"
    });
    input.type = "file";
    $("body").append(input);
    return input;
}

$.fn.fileInput = function(action, atts) {
    return this.each(function() {
        if (action === "create") {
            if ($(this).data("file_input")) {
                throw new Error("fileinput already on this element");
            }
            var input = createInput(atts);
            $(this).data("file_input", input);
            $(this).data("file_input_atts", Object(atts));

            $(this).on("mousedown", mousedowned);
            $(this).on("click", clicked);
            if (touch) $(this).on(domUtil.TOUCH_EVENTS, clickedTouch)
        } else if (action === "delete") {
            if (!$(this).data("file_input")) {
                return;
            }
            var input = $(this).data("file_input");
            $(this).data("file_input", null);
            $(this).data("file_input_atts", null);
            $(this).off("click", clicked);
            $(this).off("mousedown", mousedowned);
            if (touch) $(this).off(domUtil.TOUCH_EVENTS, clickedTouch)
            $(input).remove();
        } else if (action === "clearFiles") {
            if (!$(this).data("file_input")) {
                return;
            }
            var storedAtts = $(this).data("file_input_atts");
            var input = $(this).data("file_input");
            $(input).remove();
            input = createInput(storedAtts);
            $(this).data("file_input", input);
        }
    });
};

