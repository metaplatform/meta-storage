/*
 * META Storage
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

var crypto = require("crypto");
var express = require("express");
var logger = require("meta-logger");
var multipart = require("connect-multiparty");
var fs = require("fs");

var Storage = require("./storage.js");

/*
 * Server constructor
 *
 * options {
 * 		port
 * }
 *
 * @param Storage storage
 * @param Object opts
 */
var Server = function(storage, authorizer, opts){

	var self = this;

	if(!opts) opts = {};

	this.port = opts.port || 5020;

	this.logger = (opts.logger ? opts.logger : logger.facility("Storage"));

	this.authorizer = authorizer;
	this.storage = storage;
	this.app = express();

	var checkAuth = function(req, res, next){

		if(!req.headers["x-clientid"] || !req.headers["x-token"])
			return res.status(401).end("Unauthorized");

		self.authorizer.auth(req.headers["x-clientid"], req.headers["x-token"]).then(function(){

			self.logger.debug("Client {" + req.headers["x-clientid"] + "} authorized.");

			req.clientId = req.headers["x-clientid"];
			next();

		}, function(err){
			return res.status(401).end(err.toString());
		});

	};

	/*
	 * Define handlers
	 */
	this.app.options("*", function(req, res){

		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-ClientId, X-Token");
		res.end();

	});

	//Get object
	this.app.get("/:bucket/:id", checkAuth, function(req, res){

		self.logger.debug("Client {" + req.clientId + "} requested object {" + req.params.bucket + "/" + req.params.id + "}.");

		self.storage.getObjectFilename(req.params.bucket, req.params.id, req.headers["if-none-match"]).then(function(object){
			
			if(object === true)
				return res.status(304).end("Not modified");

			res.sendFile(object.filename, {
				headers: {
					"Content-type": object.meta.mime,
					"ETag": object.etag
				}
			});

		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//Update object
	this.app.post("/:bucket/:id", checkAuth, multipart(), function(req, res){

		if(!req.files.object)
			return res.status(400).send("Missing object field.");

		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-ClientId, X-Token");

		self.logger.debug("Client {" + req.clientId + "} requested write for object {" + req.params.bucket + "/" + req.params.id + "}.");

		self.storage.getMeta(req.params.bucket, req.params.id).then(function(meta){

			var file = req.files.object;

			fs.readFile(file.path, function(err, data){

				if(err) return res.status(500).send(err.toString());

				self.storage.writeObject(req.params.bucket, req.params.id, file.type, data, req.clientId).then(function(oid){

					self.logger.info("Client {" + req.clientId + "} writed object {" + req.params.bucket + "/" + oid + "}.");
					res.json(oid);

				}, function(err){

					res.status(500).send(err.toString());
				});

			});

		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//Get object meta
	this.app.get("/:bucket/:id/meta", checkAuth, function(req, res){

		self.logger.debug("Client {" + req.clientId + "} requested object meta for {" + req.params.bucket + "/" + req.params.id + "}.");

		self.storage.getMeta(req.params.bucket, req.params.id).then(function(meta){
			res.json(meta);
		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//Write object
	this.app.post("/:bucket", checkAuth, multipart(), function(req, res){

		if(!req.files.object)
			return res.status(400).send("Missing object field.");

		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-ClientId, X-Token");

		self.logger.debug("Client {" + req.clientId + "} requested object write for {" + req.params.bucket + "}.", req.files);

		var tasks = [];

		var handleFile = function(file){

			return new Promise(function(resolve, reject){

				fs.readFile(file.path, function(err, data){

					if(err) return reject(err);

					self.storage.writeObject(req.params.bucket, null, file.type, data, req.clientId).then(function(oid){

						self.logger.info("Client {" + req.clientId + "} writed object {" + req.params.bucket + "/" + oid + "}.");
						resolve(oid);

					}, reject);

				});

			});

		};

		for(var i in req.files.object)
			if(req.files.object[i].name)
				tasks.push(handleFile(req.files.object[i]));

		Promise.all(tasks).then(function(result){
			res.json(result);
		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//Delete object
	this.app.delete("/:bucket/:id", checkAuth, function(req, res){

		self.logger.debug("Client {" + req.clientId + "} requested delete of object {" + req.params.bucket + "}.");

		self.storage.deleteObject(req.params.bucket, req.params.id, req.clientId).then(function(){
			self.logger.info("Client {" + req.clientId + "} deleted object {" + req.params.bucket + "/" + req.params.id + "}.");
			res.status(200).end("OK");
		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//List objects
	this.app.get("/:bucket", checkAuth, function(req, res){

		self.storage.listObjects(req.params.bucket).then(function(files){
			res.json(files);
		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//List buckets
	this.app.get("/", checkAuth, function(req, res){

		self.storage.listBuckets(req.params.bucket).then(function(files){
			res.json(files);
		}, function(err){
			res.status(500).send(err.toString());
		});

	});

	//Not found
	this.app.use(function(req, res, next){

		res.status(404).end("Invalid endpoint.");

		next();

	});

};

/*
 * Starts server
 */
Server.prototype.start = function(){

	var self = this;

	return new Promise(function(resolve, reject){

		try {

			self.instance = self.app.listen(self.port, function(){

				var host = self.instance.address().address;
				var port = self.instance.address().port;

				self.logger.info('Server listening at http://%s:%s', host, port);

				resolve(self.instance);

			});

		} catch(e) {
			reject(e);
		}

	});

};

//EXPORT
module.exports = Server;