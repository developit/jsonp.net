[jsonp.net](http://jsonp.net)
=============================

[![Greenkeeper badge](https://badges.greenkeeper.io/developit/jsonp.net.svg)](https://greenkeeper.io/)

[![Join the chat at https://gitter.im/developit/jsonp.net](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/developit/jsonp.net?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

A JSONp-based web proxy.

Disclaimer: I'm open-sourcing this old service so that anyone using it can maintain it.

These days, it's best to **just use [CORS](http://enable-cors.org/)**.



---


Usage
-----

Issue a request to `http://jsonp.net/?...` where `...` is a URL-encoded JSON object describing the proxy request.

Proxy request objects are of the form:

```json
{
	"url" : "http://example.com/resource?name=test",
	"method" : "POST",
	"headers" : {
		"X-Foo" : "bar",
		"Accept" : "*/*"
	},
	"body" : "request-body-as-string",
	"callback" : "jsonpCallbackName"
}
```

You get back a JSONp response, which is just a script with a single function invocation, passing the response object:

```js
jsonpCallbackName({
	"status" : 200,
	"url" : "http://example.com/resource/test",
	"headers" : {
		"Content-Type" : "application/json"
	},
	"body" : "{\"foo\":\"bar\"}"
});
```


---


Build a Client Library
----------------------

Let's assume you have a function called `jsonp()`:

```js
function jsonp(url, callback) {
	var id = 'jsonpcb' + jsonp._c++,
		s = document.createElement('script');
	window[id] = callback;
	s.async = true;
	s.src = url.replace('{callback}', id);
	document.body.appendChild(s);
}
jsonp._c = 0;
```

Given that function, let's make a proxied version:

```js
jsonp.net = function(url, callback, opt) {
	if (typeof url==='object') url = (opt = url).url;
	var c = (opt = opt || {}).callback = '{callback}';
	jsonp('http://jsonp.net/?'+encodeURIComponent(JSON.stringify(opt)).replace('%7Bcallback%7D',c), callback);
};
```


---


License
-------

BSD
