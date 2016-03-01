/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

var fs = require("fs");
var crypto = require("crypto");

var Authorizer = function(dbFilename){

	this.credentials = {};

	this.loadDb(dbFilename);

};

Authorizer.prototype.loadDb = function(filename){

	if(!fs.existsSync(filename))
		throw new Error("Credentials DB file '" + filename + "' not exists.");

	var data = fs.readFileSync(filename, { encoding: 'utf8' });

	try {

		this.credentials = JSON.parse(data);

	} catch(err) {
		
		throw new Error("Cannot read DB file.");

	}

};

Authorizer.prototype.auth = function(clientId, token){

	var self = this;

	return new Promise(function(resolve, reject){

		if(!self.credentials[clientId]){
			return reject(new Error("Unkown clientId '" + clientId + "'."));
		}

		var now = new Date();
		var timestrA = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + now.getHours();
		var timestrB = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + (now.getHours() - 1);
		
		var localTokenA = crypto.createHash("sha256").update( clientId + self.credentials[clientId] + timestrA ).digest("hex");
		var localTokenB = crypto.createHash("sha256").update( clientId + self.credentials[clientId] + timestrB ).digest("hex");

		if(localTokenA == token || localTokenB == token){
			resolve();
		} else {
			return reject(new Error("Invalid token."));
		}

	});

};

//EXPORT
module.exports = Authorizer;