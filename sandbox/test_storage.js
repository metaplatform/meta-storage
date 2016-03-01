/*
 * META Storage
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

var Storage = require("../lib/storage.js");

var storage = new Storage({
	dir: __dirname + "/datadir"
});

var oid = null;

storage.writeObject("test", "myFile.txt", null, "Lorem ipsum...", "userAbc").then(function(objectId){

	oid = objectId;

	return storage.getObject("test", oid).then(function(contents){

		console.log("READ", oid, contents);

	});

}).then(function(){

	return storage.getMeta("test", oid).then(function(meta){

		console.log("META", meta);

	});
/*
}).then(function(){

	return storage.deleteObject("test", oid).then(function(){

		console.log("DELETED");

	});
*/
}).catch(function(err){

	console.error(err, err.stack);

});