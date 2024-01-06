/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2024 withstu <withstu@gmx.de>
 * MIT License
 */
'use strict';

const { URL } = require('url');
const axios = require('axios');
const {decode} = require('html-entities');
const keyInObject = require('./tools').keyInObject;

const {XMLParser, XMLBuilder} = require('fast-xml-parser');

class HeosUPnP {
	/**
	 * @param {string} ip IP address of player
	 */
	constructor(heos, ip){
		this.heos = heos;
		this.services = {};

		this.ip = ip;
		this.url = 'http://' + this.ip + ':60006/upnp/desc/aios_device/aios_device.xml';
	}

	async init() {
		this.logSilly('[init] Get UPNP details: ' + this.url);
		const response = await axios({
			method: 'get',
			url: this.url,
			timeout: 30000
		});
		const options = {
			parseTrueNumberOnly: true,
			processEntities: false
		};
		const parser = new XMLParser(options);
		const device = parser.parse(response.data).root.device;

		this.deviceType = device.deviceType;
		this.friendlyName = device.friendlyName;
		this.manufacturer = device.manufacturer;
		this.manufacturerURL = device.manufacturerURL;
		this.modelName = device.modelName;
		this.modelNumber = device.modelNumber;
		this.serialNumber = device.serialNumber;
		this.UDN = device.UDN;
		this.devices = await this.parseDevices(device.deviceList.device);
	}

	async parseDevices(rawdevices){
		const devices = {};

		for (const rawdevice of rawdevices) {
			const device = rawdevice;
			const id = rawdevice.deviceType.split(':')[3];
			device.services = await this.parseServices(device.serviceList.service);
			devices[id] = device;
		}
		return devices;
	}

	async parseServices(rawservices){
		const services = {};

		if(!Array.isArray(rawservices)){
			rawservices = [rawservices];
		}
		for (const rawservice of rawservices) {
			const service = rawservice;
			for (const key of Object.keys(service)) {
				if(key.includes('URL')){
					service[key] = this.absoluteUrl(this.url, service[key]);
				}
			}
			const id = service.serviceType.split(':')[3];

			if(!this.hasService(id)){
				this.logSilly('[parseServices] Get Service: ' + service.SCPDURL);
				const response = await axios({
					method: 'get',
					url: service.SCPDURL,
					timeout: 30000
				});
				const options = {
					parseTrueNumberOnly: true,
					processEntities: false
				};
				const parser = new XMLParser(options);
				const serviceDefinition = await parser.parse(response.data).scpd;
				service.actions = await this.parseActions(serviceDefinition);

				this.services[id] = service;
			}
			services[id] = this.getService(id);
		}
		return services;
	}

	async parseActions(rawactions){
		const stateTable = {};
		const actions = {};

		for (const variable of rawactions.serviceStateTable.stateVariable) {
			if(keyInObject('allowedValueList', variable)){
				variable.allowedValues = variable.allowedValueList.allowedValue;
			}
			stateTable[variable.name] = variable;
		}

		for (const rawaction of rawactions.actionList.action) {
			const action = {};
			action.name = rawaction.name;

			action.argIn = [];
			action.argOut = [];

			if(keyInObject('argumentList', rawaction)){
				if(!Array.isArray(rawaction.argumentList.argument)){
					rawaction.argumentList.argument = [rawaction.argumentList.argument];
				}
				for (const arg of rawaction.argumentList.argument) {
					const stateVariable = stateTable[arg.relatedStateVariable];
					await Object.keys(stateVariable).forEach(async key => {
						if(key != 'name') {
							arg[key] = stateVariable[key];
						}
					});
					if(arg.direction === 'in'){
						action.argIn.push(arg);
					} else {
						action.argOut.push(arg);
					}
				}
			}
			actions[rawaction.name] = action;
		}

		return actions;
	}

	getServiceList(){
		return Object.keys(this.services);
	}

	hasService(p_service){
		return keyInObject(p_service, this.services);
	}

	getService(p_service) {
		if(!this.hasService(p_service)){
			throw Error('service ' + p_service + ' not found');
		}
		return this.services[p_service];
	}

	getServiceActionList(p_service){
		const service = this.getService(p_service);
		return Object.keys(service.actions);
	}

	hasServiceAction(p_service, p_action) {
		if(this.hasService(p_service)){
			const service = this.getService(p_service);
			return keyInObject(p_action, service.actions);
		}
		return false;
	}

	getServiceAction(p_service, p_action){
		const service = this.getService(p_service);
		if(!this.hasServiceAction(p_service, p_action)){
			throw Error('action ' + p_action + ' not found');
		}
		return service.actions[p_action];
	}

	async sendCommand(p_service, p_action, data){
		if(!this.services){
			await this.init();
		}
		const service = this.getService(p_service);
		const action = this.getServiceAction(p_service, p_action);
		for (const arg of action.argIn) {
			if(!keyInObject(arg.name, data)){
				throw Error('missing parameter: ' + arg.name);
			}
		}
		const soapBody = this.getSOAPBody(service, action, data);

		this.logSilly('[sendCommand] Send command: ' + service.controlURL);
		const response = await axios({
			method: 'post',
			url: service.controlURL,
			headers: {
				'Content-Type': 'text/xml; charset="utf-8"',
				'Content-Length': soapBody.length,
				'Connection': 'close',
				'SOAPACTION': `"${service.serviceType}#${action.name}"`
			},
			data: soapBody,
			timeout: 30000
		});
		const result = this.parseSOAPResponse(response.data, action.name, action.argOut);

		const options = {
			parseTrueNumberOnly: true,
			processEntities: false,
			ignoreAttributes: false,
			parseAttributeValue: true,
			ignoreNameSpace: true,
			attributeNamePrefix : '@_',
			textNodeName : 'value'
		};
		const parser = new XMLParser(options);

		for(const key in result){
			if(typeof result[key].includes === 'function'
				&& result[key].includes('&lt;')){
				result[key] = parser.parse(decode(result[key]));
			}
		}

		if(keyInObject('CurrentState', result)){
			let state = result['CurrentState'];
			if(keyInObject('Event', state)){
				if(keyInObject('InstanceID', state['Event'])){
					state = state['Event']['InstanceID'];
					delete state['@_val'];
				} else {
					state = state['Event'];
				}
			}
			for(const key in state){
				if(state[key]['@_val']
					&& typeof state[key]['@_val'].includes === 'function'
					&& state[key]['@_val'].includes('&lt;')){
					state[key]['@_val'] = parser.parse(decode(state[key]['@_val']).replace(/&quot;/g,''));
					if(keyInObject('DIDL-Lite', state[key]['@_val'])){
						state[key]['@_val'] = state[key]['@_val']['DIDL-Lite']['item'];
					}
				}
			}
			result['CurrentState'] = state;
		}
		for(const key in result){
			if(keyInObject('DIDL-Lite', result[key])){
				result[key] = JSON.parse(JSON.stringify(result[key]['DIDL-Lite']['item']).replace(/&quot;/g,''));
			}
		}

		return result;
	}

	parseSOAPResponse(xmlString, action, outputs) {
		const options = {
			processEntities: false,
		};
		const parser = new XMLParser(options);
		const envelope = parser.parse(xmlString);
		const res = envelope['s:Envelope']['s:Body'][`u:${action}Response`];
		return outputs.reduce((a, { name }) => {
			a[name] = res[name];
			return a;
		}, {});
	}

	getArguments(data) {
		if (!data) {
			return {};
		}
		return Object.keys(data).reduce((a, name) => {
			const value = data[name];
			if (value !== undefined) {
				a[name] = (value === null) ? '' : value.toString();
			}
			return a;
		}, {});
	}

	getSOAPBody(service, action, data) {
		const envelope = {
			's:Envelope': {
				'@xmlns:s': 'http://schemas.xmlsoap.org/soap/envelope/',
				'@s:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
				's:Body': {
					[`u:${action.name}`]: {
						'@xmlns:u': service.serviceType,
						...this.getArguments(data)
					}
				}
			}
		};
		const options = {
			attributeNamePrefix: '@',
			ignoreAttributes: false,
		};
		const builder = new XMLBuilder(options);
		return builder.build(envelope);
	}

	absoluteUrl(baseUrl, url) {
		return new URL(url, baseUrl).toString();
	}

	logInfo(msg, force){
		this.heos.logInfo('[HeosUpnp] ' + msg, force);
	}

	logWarn(msg, force){
		this.heos.logWarn('[HeosUpnp] ] ' + msg, force);
	}

	logError(msg, force){
		this.heos.logError('[HeosUpnp] ' + msg, force);
	}

	logDebug(msg, force){
		this.heos.logDebug('[HeosUpnp] ' + msg, force);
	}

	logSilly(msg, force){
		this.heos.logSilly('[HeosUpnp] ' + msg, force);
	}
}

module.exports = HeosUPnP;