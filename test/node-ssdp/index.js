const NodeSSDP = require('node-ssdp').Client;

const urn = 'urn:schemas-denon-com:device:ACT-Denon:1';

async function searchHeos (){
	const client = new NodeSSDP();
	client.on('response', function (headers, statusCode, rinfo) {
		console.log('Header: ' + JSON.stringify(headers));
		console.log('Status Code: ' + JSON.stringify(statusCode));
		console.log('rinfo: ' + JSON.stringify(rinfo));
	});

	// search for a service type
	console.log('searching for HEOS devices ...');
	client.search(urn);

	setInterval(() => {
		console.log('searching for HEOS devices ...');
		client.search(urn);
	}, 10000);
}

searchHeos();