function deployApi(api) {
    self.onmessage = function(event) {
        var data = event.data;
        var id = data.id;
        var args = data.args;
        var methodName = data.methodName;
        var transferList = data.transferList || [];
        new Promise(function(resolve) {
            var ret = api[methodName]({
                args: args,
                transferList: transferList
            });
            resolve(ret);

        }).then(function(result) {
            var message = {
                id: id,
                result: result,
                transferList: null
            };

            if (transferList) {
                message.transferList = transferList;
                self.postMessage(message, transferList);
            } else {
                self.postMessage(message);
            }
        }).catch(function(e) {
            var error = e || new Error(e + "");
            var message = {
                id: id,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                },
                transferList: null
            };
            if (transferList) {
                message.transferList = transferList;
                self.postMessage(message, transferList);
            } else {
                self.postMessage(message);
            }
        })
    };
}
