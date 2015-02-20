exports.config = {
	enableClustering : false,			// not on heroku
	port : process.env.PORT || 8001,	// map from 80 via iptables :::: iptables -t nat -L
	host : null,						// 'jsonp.net',
	cache_lifetime : 30					// seconds
};
