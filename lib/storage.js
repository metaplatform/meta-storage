/*
 * META Storage
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

var fs = require("fs");
var mime = require("mime");
var crypto = require("crypto");
var EventEmitter = require('events').EventEmitter;

/*
 * Storage constructor
 *
 * options {
 * 		dir: "./storage"
 * }
 *
 * @param Object opts
 */
var Storage = function(opts){

	if(!opts) opts = {};

	this.storageDir = opts.dir || "./storage";

	if(!fs.existsSync(this.storageDir))
		throw new Error("Storage directory not exists.");

};

Storage.prototype = Object.create(EventEmitter.prototype);

/*
 * Ensures that bucket directory exists
 *
 * @param string name
 * @return Promise
 */
Storage.prototype.ensureBucket = function(name){

	var self = this;

	var bucketDir = this.storageDir + "/" + name;

	return new Promise(function(resolve, reject){

		try {

			fs.exists(bucketDir, function(res){

				if(res) return resolve();

				fs.mkdir(bucketDir, function(err){

					if(err) return reject(err);

					self.emit("bucketCreate", name);
					resolve();

				});

			});

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Returns list of buckets
 *
 * @return Promise
 * @resolve array
 */
Storage.prototype.listBuckets = function(){

	var self = this;

	var rootDir = this.storageDir + "/";

	return new Promise(function(resolve, reject){

		try {

			fs.readdir(rootDir, function(err, files){

				if(err) return reject(new Error("Cannot read root storage dir."));

				resolve(files);

			});

		} catch(e){
			reject(e);
		}

	});

};

/*
 * List files in a bucket
 *
 * @param string bucket
 * @return Promise
 * @return array
 */
Storage.prototype.listObjects = function(bucket){

	var self = this;

	var bucketFn = this.storageDir + "/" + bucket;

	return new Promise(function(resolve, reject){

		try {

			fs.exists(bucketFn, function(res){

				if(!res) return reject(new Error("Bucket {" + bucket + "} not found."));

				fs.readdir(bucketFn, function(err, files){

					if(err) reject(new Error("Cannot read bucket {" + bucket + "}."));

					var fileList = [];

					for(var i in files)
						if(files[i].substr(0, 1) != "_") fileList.push(files[i]);

					resolve(fileList);

				});

			});

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Creates object ID hash
 *
 * @param string bucket
 * @param string name
 * @return string
 */
Storage.prototype.createObjectId = function(bucket){

	return crypto.createHash("md5").update(bucket + "/" + Math.random() + ":" + (new Date()).getTime()).digest("hex");

};

/*
 * Creates ETag for caching
 *
 * @param string objectId
 * @param object meta
 */
Storage.prototype.createETag = function(objectId, meta){

	return crypto.createHash("md5").update(objectId + ":" + meta.modified).digest("hex");

};

/*
 * Writes object
 *
 * @param string bucket
 * @param string objectId
 * @param Buffer data
 * @param string userId
 * @return Promise
 */
Storage.prototype.writeObject = function(bucket, objectId, mimeType, data, userId){

	var self = this;

	if(!objectId)
		objectId = this.createObjectId(bucket);
	
	var objectFn = this.storageDir + "/" + bucket + "/" + objectId;
	var metaFn = this.storageDir + "/" + bucket + "/_" + objectId;


	return new Promise(function(resolve, reject){

		try {

			self.ensureBucket(bucket).then(function(){

				fs.writeFile(objectFn, data, function(err){

					if(err) return reject(err);

					var metaData = {
						mime: (mimeType ? mimeType : mime.lookup(name)),
						modified: (new Date()).getTime(),
						user: userId
					};

					fs.writeFile(metaFn, JSON.stringify(metaData), { encoding: 'utf8' }, function(err){

						if(err) return reject(err);

						self.emit("objectWrite", bucket, objectId, userId);
						resolve(objectId);

					});

				});

			});

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Deletes object
 *
 * @param string bucket
 * @param string objectId
 * @return Promise
 */
Storage.prototype.deleteObject = function(bucket, objectId, userId){

	var self = this;

	var objectFn = this.storageDir + "/" + bucket + "/" + objectId;
	var metaFn = this.storageDir + "/" + bucket + "/_" + objectId;

	return new Promise(function(resolve, reject){

		try {

			fs.exists(objectFn, function(res){

				if(!res) return reject(new Error("Object {" + bucket + "/" + objectId + "} not found."));

				fs.unlink(objectFn, function(err){

					if(err) return reject(new Error("Cannot delete object {" + bucket + "/" + objectId + "}."));

					fs.unlink(metaFn, function(err){

						if(err) return reject(new Error("Canot delete meta data for object {" + bucket + "/" + objectId + "}."));

						self.emit("objectDelete", bucket, objectId, userId);
						resolve();

					});

				});

			});

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Returns object meta and contents
 *
 * @param string bucket
 * @param string objectId
 * @return Promise
 */
Storage.prototype.getObject = function(bucket, objectId, etag){

	var self = this;

	var objectFn = this.storageDir + "/" + bucket + "/" + objectId;

	return new Promise(function(resolve, reject){

		try {

			self.getMeta(bucket, objectId).then(function(meta){

				var localETag = self.createETag(objectId, meta);

				if(etag && etag == localETag){
					return resolve(true);
				}

				fs.exists(objectFn, function(res){

					if(!res) return reject(new Error("Object {" + bucket + "/" + objectId + "} not found."));

					fs.readFile(objectFn, function(err, data){

						if(err) return reject(new Error("Cannot read object {" + bucket + "/" + objectId + "}."));

						resolve({
							meta: meta,
							content: data,
							etag: localETag
						});

					});

				});

			}, reject);

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Returns object filename
 *
 * @param string bucket
 * @param string objectId
 * @return Promise
 */
Storage.prototype.getObjectFilename = function(bucket, objectId){

	var self = this;

	var objectFn = this.storageDir + "/" + bucket + "/" + objectId;

	return new Promise(function(resolve, reject){

		try {

			self.getMeta(bucket, objectId).then(function(meta){

				var localETag = self.createETag(objectId, meta);

				resolve({
					meta: meta,
					filename: objectFn,
					etag: localETag
				});

			}, reject);

		} catch(e){
			reject(e);
		}

	});

};

/*
 * Returns object meta-data
 *
 * @param string bucket
 * @param string objectId
 * @return Promise
 */
Storage.prototype.getMeta = function(bucket, objectId){

	var self = this;

	var metaFn = this.storageDir + "/" + bucket + "/_" + objectId;

	return new Promise(function(resolve, reject){

		try {

			fs.exists(metaFn, function(res){

				if(!res) return reject(new Error("Object {" + bucket + "/" + objectId + "} not found."));

				fs.readFile(metaFn, { encoding: 'utf8' }, function(err, data){

					if(err) return reject(new Error("Cannot read object meta data for {" + bucket + "/" + objectId + "}."));

					try {

						var meta = JSON.parse(data);
						resolve(meta);

					} catch(e){
						reject(e);
					}

				});

			});

		} catch(e){
			reject(e);
		}

	});

};

//EXPORT
module.exports = Storage;