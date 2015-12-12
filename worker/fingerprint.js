importScripts("worker_api.js");
importScripts("AcoustId.js");

deployApi({getAcoustId: AcoustId.calculate});
