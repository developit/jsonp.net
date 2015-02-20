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
	
	/*
	// apparently url.parse is useless.
	//urlParts = url.parse(params.url);
	var urlSearch = (/^(?:([a-z][a-z0-9]{1,6}\:)\/\/([^\:\@\/\?\#]+(?:\:[^\:\@\/\?\#]+)?\@)?([^\:\@\/\?\#]+))?([^\#\?]+)?(\?[^\#]*)?(\#.*)?$/gim).exec(params.url);
	//var urlSearch = params.url.match(/^([a-z0-9]{2,6}\:)\/\/([^\/\?\#]+)(\/[^\#\?]+)?(\?[^\#]*)?(\#.*)?/gim);
	//var urlSearch = (/^([a-z0-9]{2,6}\:)(\/\/)/gim).exec(params.url);
	urlParts = {
		protocol	: urlSearch[1] || '',
		auth		: urlSearch[2] || '',
		hostname	: urlSearch[3] || '',
		pathname	: urlSearch[4] || '',
		search		: urlSearch[5] || '',
		hash		: urlSearch[6] || ''
	};
	urlParts.host = urlParts.auth + urlParts.hostname;
	*/
	
	urlParts = require('url').parse(params.url);

	function prop(obj, key) {
		return obj[key] || '';
	}
	
	/*
	callback({
		url : params.url,
		urlSearch : Array.prototype.slice.call(urlSearch, 0, urlSearch.length),
		urlParts : JSON.stringify(urlParts)
	});
	return true;
	*/
	
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
		
		/*
		if (urlParts.protocol==='https') {
			client = https.createClient(urlParts.port || 443, urlParts.hostname);
		}
		else {
			client = http.createClient(urlParts.port || 80, urlParts.hostname);
		}
		
		request = client.request(
			method,
			(urlParts.pathname || "") + (urlParts.search || "") + (urlParts.hash || ""),
			requestHeaders
		);
		*/
		
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
					//response.end();		// there is no response.end, so just let the request die :(
				
					var redirUrl = response.headers['location'];
					//sys.puts("Redirect #"+redirectCount+" = " + redirUrl);
					
					// I guess we can be lenient with relative Location: redirects... but it's still wrong!
					if (!redirUrl.match(/^[a-z0-9]{2,9}\:\/\//gim)) {
						if (redirUrl.substring(0,1)!=="/") {
							redirUrl = urlParts.pathname.replace(/\/[^\/]*?$/gim,'/') + redirUrl;
						}
						redirUrl = urlParts.protocol+"//" + urlParts.host + redirUrl;
					}
				
					params.redirect_urls.push(redirUrl);
					
					// don't forward the request body (or length). The spec doesn't allow for rediction of POST/PUT/etc.
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
						//sys.puts("URL :: " + redirUrl + "\r\nCOOKIE :: " + cookieStr);
						//console.log(cookieStr);
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
				//response.setEncoding(params.encoding || 'utf8');
				//response.setEncoding('hex');
				response.on('data', function(chunk) {
					bodyBuffers.push(chunk);
					//bodyBuffer.write(chunk.toString('base64'), buflen, );
					//bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
					//try {
					//	clientResponse.body += chunk;
					//} catch(err) {
					//	clientResponse.parseError = true;
					//}
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

