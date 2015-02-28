var http = require('http'),
	https = require('https'),
	url = require('url'),
	dns = require('dns'),
	cache = {};

exports.proxy = function proxy(params, callback) {
	var urlParts, resolved_url, method, client, request, requestHeaders, p, cacheEntry,
		time = new Date().getTime(),
		cacheKey = JSON.stringify(params),
		expiry = Math.max((Math.round(params.expiry) || 0) || 30);
	
	if (cache.hasOwnProperty(cacheKey) && (cacheEntry = cache[cacheKey])) {
		if (cacheEntry.data && (time-cacheEntry.created)/1000<expiry && time<cacheEntry.expires) {
			setTimeout(function() {
				callback(cacheEntry.data);
				cacheEntry = params = callback = null;
			}, 1);
			return;
		}
		else {
			delete cache[cacheKey];
		}
	}
	
	params = params || {};
	if (!params.url) {
		return false;
	}
	
	params.redirect_urls = params.redirect_urls || [];
	
	urlParts = require('url').parse(params.url);

	function prop(obj, key) {
		return obj[key] || '';
	}
	
	method = params.method && params.method.toUpperCase() || "GET";
	
	resolved_url = urlParts.protocol + '//' + prop(urlParts, 'auth') + prop(urlParts, 'host') + prop(urlParts, 'pathname') + prop(urlParts, 'search') + prop(urlParts, 'hash');
	
	requestHeaders = {};
	if (params.headers) {
		for (p in params.headers) {
			if (params.headers.hasOwnProperty(p)) {
				requestHeaders[(p+'').toLowerCase()] = params.headers[p];
			}
		}
	}
	requestHeaders.host = urlParts.hostname;
	if (params.body && method!=="GET") {
		requestHeaders['content-length'] = params.body.length + '';
	}
	
	dns.lookup(urlParts.hostname, null, function(err) {
		if (err) {
			callback({
				error : true,
				errorMessage : "DNS lookup failed for " + urlParts.hostname,
				dnsLookupError : true
			});
			return false;
		}
		
		if (urlParts.pathname.substring(0,1)!=="/") {
			urlParts.pathname = "/" + urlParts.pathname;
		}
		
		request = ( urlParts.protocol==='https:' ? https : http ).request({
			hostname	: urlParts.hostname,
			port		: urlParts.port || (urlParts.protocol==='https:' ? 443 : 80),
			auth		: urlParts.auth || null,
			method		: method,
			path		: prop(urlParts, 'pathname') + prop(urlParts, 'search'),
			headers		: requestHeaders || null
		});
		
		request.on('response', function(response) {
			var clientResponse, redirectCount;
			redirectCount = parseInt(params.__redirectCount) || 0;
		
			// automatically follow location redirects
			if (response.headers && response.headers['location']) {
				if (redirectCount<20) {
					//response.end();		// @todo: kill response
				
					var redirUrl = response.headers['location'];

					// relative Location redirects (bad)
					if (!redirUrl.match(/^[a-z0-9]{2,9}\:\/\//gim)) {
						if (redirUrl.substring(0,1)!=="/") {
							redirUrl = urlParts.pathname.replace(/\/[^\/]*?$/gim,'/') + redirUrl;
						}
						redirUrl = urlParts.protocol+"//" + urlParts.host + redirUrl;
					}
				
					params.redirect_urls.push(redirUrl);
					
					// Don't forward request body. Only allow redirection of GET
					if (!params.headers) {
						params.headers = {};
					}
					if (params.headers['content-length']) {
						delete params.headers['content-length'];
					}
					params.headers['referer'] = params.url;
					if (response.headers['set-cookie']) {
						var cookies = response.headers['set-cookie'],
							cookieStr = "";
						if (Object.prototype.toString.call(cookies)!=='[object Array]') {
							cookies = [cookies];
						}
						for (var x=0; x<cookies.length; x++) {
							cookieStr += cookies[x].substring(0, cookies[x].indexOf(';')>-1?cookies[x].indexOf(';'):cookies[x].length) + "; ";
						}
						cookieStr = cookieStr.replace(/\;\s$/gim,'');
						params.headers['cookie'] = cookieStr;
					}
					
					// make the new request, passing everything the same except the URL.
					proxy({
						headers	: params.headers,
						url		: redirUrl,
						method	: method,
						__redirectCount : redirectCount + 1,
						redirect_urls : params.redirect_urls,
						proxyCookies : params.headers['cookie'] + (params.proxyCookies?("; "+params.proxyCookies):"")
					}, callback);
				}
				else {
					// looks like we're in a redirect loop.
					callback({
						error : true,
						errorMessage : "Too many Location redirects",
						redirectLoopError : true,
						debug : {
							redirect_urls : params.redirect_urls,
							resolved_url : resolved_url,
							headers : params.headers,
							url_parsed : urlParts,
							https : urlParts.protocol==='https:'
						}
					});
				}
			
				client = requestHeaders = request = null
			}
			else {
				clientResponse = {
					connected : true,
					completed : false,
					headers	: response.headers,
					status	: response.statusCode,
					body	: "",
					length	: 0,
					url		: params.url,
					proxyCookies : params.proxyCookies
				};
				
				var bodyBuffers = [];
				response.on('data', function(chunk) {
					bodyBuffers.push(chunk);
				});
				response.on('end', function() {
					clientResponse.body = Buffer.concat(bodyBuffers).toString(params.encoding || 'utf8');
					clientResponse.completed = true;
					clientResponse.length = clientResponse.body.length;
					cache[cacheKey] = {
						created : new Date().getTime(),
						expires : new Date().getTime() + 30*1000,
						data : clientResponse
					};
					callback(clientResponse);
				});
			}
		});
		
		if (params.body && method!=="GET") {
			request.write(params.body);
		}
		request.end();
		
	});
};

