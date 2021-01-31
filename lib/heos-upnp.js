/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2021 withstu <withstu@gmx.de>
 * MIT License
 */
'use strict';

const { URL } = require('url')
const got = require('got')
const {decode} = require('html-entities')

const parser = require('fast-xml-parser')
const converter = new parser.j2xParser({
  attributeNamePrefix: '@',
  ignoreAttributes: false
});

const USER_AGENT = 'LINUX UPnP/1.0 Denon-Heos/149200'

class HeosUPnP {
	/**
	 * @param {string} ip IP address of player
	 */
	constructor(ip){
		this.ip = ip
		this.url = "http://" + this.ip + ":60006/upnp/desc/aios_device/aios_device.xml"
		this.client = got.extend({
			headers: {
			  'user-agent': USER_AGENT
			}
		})
	}

	async init() {
		const response = await this.client(this.url)
		const device = parser.parse(response.body, { parseTrueNumberOnly: true }).root.device

		this.deviceType = device.deviceType
		this.friendlyName = device.friendlyName
		this.manufacturer = device.manufacturer
		this.manufacturerURL = device.manufacturerURL
		this.modelName = device.modelName
		this.modelNumber = device.modelNumber
		this.serialNumber = device.serialNumber
		this.UDN = device.UDN
		this.services = {}

		return this.devices = await this.parseDevices(device.deviceList.device)
	}

	async parseDevices(rawdevices){
		let devices = {}

		for (const rawdevice of rawdevices) {
			let device = rawdevice
			let id = rawdevice.deviceType.split(':')[3]
			device.services = await this.parseServices(device.serviceList.service)
			devices[id] = device
		}
		return devices;
	}

	async parseServices(rawservices){
		let services = {}
		
		if(!Array.isArray(rawservices)){
			rawservices = [rawservices]
		}
		for (const rawservice of rawservices) {
			let service = rawservice
			let that = this
			for (const key of Object.keys(service)) {
				if(key.includes('URL')){
					service[key] = that.absoluteUrl(that.url, service[key])
				}
			}
			let id = service.serviceType.split(':')[3]

			let response = await this.client(service.SCPDURL);
			let serviceDefinition = await parser.parse(response.body, { parseTrueNumberOnly: true }).scpd;
			service.actions = await this.parseActions(serviceDefinition)

			services[id] = service
			that.services[id] = service
		}
		return services;
	}

	async parseActions(rawactions){
		let stateTable = {}
		let actions = {}

		for (const variable of rawactions.serviceStateTable.stateVariable) {
			if('allowedValueList' in variable){
				variable.allowedValues = variable.allowedValueList.allowedValue
			}
			stateTable[variable.name] = variable
		}

		for (const rawaction of rawactions.actionList.action) {
			let action = {}
			action.name = rawaction.name

			action.argIn = []
			action.argOut = []

			if('argumentList' in rawaction){
				if(!Array.isArray(rawaction.argumentList.argument)){
					rawaction.argumentList.argument = [rawaction.argumentList.argument]
				}
				for (const arg of rawaction.argumentList.argument) {
					let stateVariable = stateTable[arg.relatedStateVariable]
					await Object.keys(stateVariable).forEach(async key => {
						if(key != 'name') {
							arg[key] = stateVariable[key]
						}
					})
					if(arg.direction === 'in'){
						action.argIn.push(arg)
					} else {
						action.argOut.push(arg)
					}
				}
			}
			actions[rawaction.name] = action
		}

		return actions
	}

	getServiceList(){
		return Object.keys(this.services)
	}

	getService(p_service) {
		if(!this.services || !(p_service in this.services)){
			throw Error('service ' + p_service + ' not found')
		}
		return this.services[p_service]
	}

	getServiceActionList(p_service){
		let service = this.getService(p_service)
		return Object.keys(service.actions)
	}

	getServiceAction(p_service, p_action){
		let service = this.getService(p_service)
		if(!service.actions || !(p_action in service.actions)){
			throw Error('action ' + p_action + ' not found')
		}
		return service.actions[p_action]
	}

	async sendCommand(p_service, p_action, data){
		let service = this.getService(p_service)
		let action = this.getServiceAction(p_service, p_action)
		for (const arg of action.argIn) {
			if(!(arg.name in data)){
				throw Error('missing parameter: ' + arg.name)
			}
		}
		let soapBody = this.getSOAPBody(service, action, data)

		const res = await this.client({
			throwHttpErrors: false,
			url: service.controlURL,
			method: 'POST',
			body: soapBody,
			headers: {
				'Content-Type': 'text/xml; charset="utf-8"',
				'Content-Length': soapBody.length,
				'Connection': 'close',
				'SOAPACTION': `"${service.serviceType}#${action.name}"`
			}
		});

		if (res.statusCode !== 200) {
			throw Error('soap command ' + action.name + ' failure: ' + res.statusCode);
		}

		let result = this.parseSOAPResponse(res.body, action.name, action.argOut)

		for (const key of Object.keys(result)) {
			if(key.includes('MetaData') && result[key].length){
				result[key] = this.parseMetaData(result[key])
			}
		}

		return result;
	}

	parseMetaData(xmlString) {
		let result = parser.parse(decode(xmlString), { 
			parseTrueNumberOnly: true, 
			ignoreAttributes: false, 
			parseAttributeValue: true, 
			ignoreNameSpace: true,
			attributeNamePrefix : "@_", 
			textNodeName : "value"
		});
		return result['DIDL-Lite']['item']
	}

	parseSOAPResponse(xmlString, action, outputs) {
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
		}
		return converter.parse(envelope);
	}
	
	absoluteUrl(baseUrl, url) {
		return new URL(url, baseUrl).toString();
	}
}

module.exports = HeosUPnP;