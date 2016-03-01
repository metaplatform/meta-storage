/*
 * META Storage
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

var logger = require("meta-logger");

var Storage = require("../lib/storage.js");
var Authorizer = require("../lib/authorizer.js");
var Server = require("../lib/server.js");

logger.toConsole({
	level: "debug",
	timestamp: true,
	colorize: true
});

var storage = new Storage({
	dir: __dirname + "/datadir"
});

var authorizer = new Authorizer("./auth.json");

var server = new Server(storage, authorizer, {});

server.start().then(function(){

	console.log("Started.");

});