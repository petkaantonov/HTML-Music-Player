(function($) {
    function clicked() {
        $(this).data("file_input").click();
    }

    function createInput(atts) {
        var input = document.createElement("input");
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
                $(this).bind("click", clicked);
            } else if (action === "delete") {
                if (!$(this).data("file_input")) {
                    return;
                }
                var input = $(this).data("file_input");
                $(this).data("file_input", null);
                $(this).data("file_input_atts", null);
                $(this).unbind("click", clicked);
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
})(jQuery);
