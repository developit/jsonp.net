var cluster = require('cluster'),
	util	= require('util'),
	http = require('http');
	url		= require('url'),
	httplib	= require('./lib/httplib'),
	config	= require('./app/config').config,
	requestCache = [];


if (config.enableClustering===true && cluster.isMaster) {
	// Fork workers:
	for (var i=require('os').cpus().length; i--; ) {
		cluster.fork();
	}

	cluster.on('death', function(worker) {
		console.log('worker ' + worker.pid + ' died. starting new worker.');
		cluster.fork();
	});
}
else {
	// Worker processes have a http server:

	function getCached(conf) {
		var now = new Date().getTime(),
			since = now - (config.cache_lifetime || 0) * 1000,
			i;
		for (i in requestCache) {
			if (requestCache[i].time<since) {
				delete requestCache[i];
			}
		}
		i = requestCache[conf];
		return i && i.response || false;
	}
	function setCached(conf, response) {
		requestCache[conf] = {
			time : new Date().getTime(),
			response : response
		};
	}

	http.createServer(function(req, res) {
		var end, requestUrl, data, requestEnded, overallTimeout, callback, cached;

		if (config.host && req.headers.host!==config.host) {
			console.log('Invalid hostname. Received '+req.headers.host+', expected '+config.host);
			res.writeHead(404, {'content-type':'text/plain'});
			res.end('Invalid hostname.');
			return;
		}

		//console.log('Request received: http://', req.headers.host + req.url);

		end = function(responseData, fromCache) {
			var response;
			if (overallTimeout) {
				clearTimeout(overallTimeout);
			}
			if (fromCache===true) {
				response = responseData;
			}
			else {
				response = (callback || "callback") + "(" + JSON.stringify(responseData) + ");";
				setCached(requestUrl, response);
			}
			res.end(response);
			end = req = res = cached = null;
		};

		requestUrl = req.url.replace(/^[\/\?]+/gim,'');
		if (requestUrl.substring(0,1)!=="{" && requestUrl.length>1) {
			requestUrl = decodeURIComponent(requestUrl);
		}

		// Get possible cached copy
		cached = getCached(requestUrl);

		res.writeHead(200, {
			'Content-Type'	: 'text/javascript',
			'X-Cached'		: cached ? 'true' : 'false'
		});

		// Use the cached copy if valid
		if (cached) {
			end(cached, true);
			return;
		}

		try {
			data = JSON.parse(requestUrl);
		} catch(err) {
			data = null;
		}

		if (data && data.url) {
			if (data.post && (data.method+"").toUpperCase()==="POST") {
				data.body = "";
				for (var x in data.post) {
					data.body += "&" + encodeURIComponent(x) + "=" + encodeURIComponent(data.post[x]);
				}
				if (data.body.length>0) {
					data.body = data.body.substring(1);
				}
				delete data.post;
				if (!data.headers) {
					data.headers = {};
				}
				else {
					for (var x in data.headers) {
						if ((x+"").toLowerCase()==='content-type' || (x+"").toLowerCase()==='content-length') {
							delete data.headers[x];
						}
					}
				}
				data.headers['content-type'] = "application/x-www-form-urlencoded";
				data.headers['content-length'] = data.body.length + '';
			}
			callback = data.callback;
			httplib.proxy(data, function(response) {
				//util.puts('proxying "'+data.url+'"');
				if (data.encoding==='base64') {
					//response.encoding = 'base64';
					//response.body = new Buffer(response.body).toString('base64');
				}
				if (end) {
					end(response);
				}
			});
		}
		else {
			return end({
				error : true,
				errorMessage : "Could not parse JSON request options",
				parseError : true
			});
		}
	}).listen(config.port || 80, config.host);

	console.log('Running at '+(config.host || '*')+':'+(config.port || 80)+'.', config);
}
