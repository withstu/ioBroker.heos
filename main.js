/**
 *      ioBroker HEOS Adapter
 *      Copyright (c) 2020 withstu <withstu@gmx.de>
 *      MIT License
 *
 *      derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula
 */
'use strict';

const utils = require('@iobroker/adapter-core');

const net = require('net');
const NodeSSDP = require('node-ssdp').Client;
const HeosPlayer = require('./lib/heos-player');

const States = {
    Disconnecting: 0,
    Disconnected: 1,
    Searching: 2,
    Reconnecting: 3,
    Connecting: 4,
    Connected: 5
}

class Heos extends utils.Adapter {
	
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'heos',
		});
		this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));

        /** @type {Map<String,HeosPlayer>} */
        this.players = new Map();
        this.ip = '';
        this.state = States.Disconnected;
        
        this.heartbeatInterval = undefined;
        this.heartbeatRetries = 0;
        this.ssdpSearchInterval = undefined;
        this.reconnectTimeout = undefined;

        this.net_client = undefined;
        this.nodessdp_client = undefined;
        this.msgs = [];
        this.unfinishedResponses = '';
        this.ssdpSearchTargetName = 'urn:schemas-denon-com:device:ACT-Denon:1';
    }

	async onReady() {
		await this.setObjectNotExistsAsync('players', {
            type: 'device',
			common: {
                name: 'List of HEOS players',
                role: 'media'
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('command', {
			type: 'state',
			common: {
                name: 'HEOS command',
                desc: 'Send command to HEOS',
				type: 'string',
				role: 'command',
				read: true,
				write: true
			},
			native: {},
        });
        await this.setObjectNotExistsAsync('connected', {
			type: 'state',
			common: {
                name: 'Connection status',
                desc: 'True, if a connection to one HEOS player exists',
				type: 'boolean',
				role: 'command',
				read: true,
                write: false,
                def: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync('signed_in', {
			type: 'state',
			common: {
                name: 'Sign-in status',
                desc: 'True, if a user is signed in',
				type: 'boolean',
				role: 'command',
				read: true,
                write: false,
                def: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync('signed_in_user', {
			type: 'state',
			common: {
                name: 'Signed-in user',
                desc: 'Username of the signed in user',
				type: 'string',
				role: 'command',
				read: true,
                write: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync('error', {
			type: 'state',
			common: {
                name: 'Error status',
                desc: 'True, if an error exists',
				type: 'boolean',
				role: 'command',
				read: true,
                write: false,
                def: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync('last_error', {
			type: 'state',
			common: {
                name: 'Last error messages',
                desc: 'Last 4 error messages',
				type: 'string',
				role: 'command',
				read: true,
                write: false
			},
			native: {},
        });
        
        //Root
        this.subscribeStates('command');

        //Presets|Playlists
        this.subscribeStates('presets.*.play')
        this.subscribeStates('playlists.*.play')

        //Players
        this.subscribeStates('players.*.muted');
        this.subscribeStates('players.*.repeat');
        this.subscribeStates('players.*.shuffle');
        this.subscribeStates('players.*.state');
        this.subscribeStates('players.*.state_simple');
        this.subscribeStates('players.*.volume');
        this.subscribeStates('players.*.volume_up');
        this.subscribeStates('players.*.volume_down');
        this.subscribeStates('players.*.group_volume');
        this.subscribeStates('players.*.group_muted');
        this.subscribeStates('players.*.command');
        this.subscribeStates('players.*.play');
        this.subscribeStates('players.*.stop');
        this.subscribeStates('players.*.pause');
        this.subscribeStates('players.*.next');
        this.subscribeStates('players.*.prev');
        this.subscribeStates('players.*.auto_play');
        this.subscribeStates('players.*.ignore_broadcast_cmd');

        this.main();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
            this.disconnect();
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} _id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(_id, state) {
        if (!state || state.ack) return;
        const id = this.idToDCS(_id);

        if(id){
            if (state.val === 'false') {
                state.val = false;
            }
            if (state.val === 'true') {
                state.val = true;
            }
            if (parseInt(state.val) == state.val) {
                state.val = parseInt(state.val);
            }

            if(id.device === 'command'){
                this.executeCommand(state.val);
            } else if (id.device === 'playlists' && id.channel && id.state === 'play') {
                this.sendCommandToAllPlayers('add_to_queue&sid=1025&aid=4&cid=' + id.channel, true);
            } else if (id.device === 'presets' && id.channel && id.state === 'play') {
                this.sendCommandToAllPlayers('play_preset&preset=' + id.channel, true);
            } else if (id.device === 'players' && id.channel && id.state && this.players.has(id.channel)) {
                let player = this.players.get(id.channel);
                if(player) {
                    if(id.state === 'muted'){
                        player.sendCommand('set_mute&state=' + (state.val === true ? 'on' : 'off'));
                    } else if(id.state === 'repeat'){
                        player.sendCommand('set_play_mode&repeat=' + state.val);
                    } else if(id.state === 'shuffle'){
                        player.sendCommand('set_play_mode&shuffle=' + (state.val === true ? 'on' : 'off'));
                    } else if(id.state === 'state'){
                        player.sendCommand('set_play_state&state=' + state.val);
                    } else if(id.state === 'state_simple'){
                        if(state.val === true){
                            player.sendCommand('set_play_state&state=play');
                        } else {
                            player.sendCommand('set_play_state&state=pause');
                        }
                    } else if(id.state === 'volume'){
                        player.sendCommand('set_volume&level=' + state.val);
                    } else if(id.state === 'group_volume'){
                        player.sendCommand('set_group_volume&level=' + state.val);
                    } else if(id.state === 'group_muted'){
                        player.sendCommand('set_group_mute&state=' + (state.val === true ? 'on' : 'off'));
                    } else if(id.state === 'command'){
                        player.sendCommand(state.val);
                    } else if(id.state === 'play'){
                        player.sendCommand('set_play_state&state=play');
                    } else if(id.state === 'pause'){
                        player.sendCommand('set_play_state&state=pause');
                    } else if(id.state === 'stop'){
                        player.sendCommand('set_play_state&state=stop');
                    } else if(id.state === 'prev'){
                        player.sendCommand('play_previous');
                    } else if(id.state === 'next'){
                        player.sendCommand('play_next');
                    } else if(id.state === 'volume_up'){
                        player.sendCommand('volume_up&step=' + this.config.volumeStepLevel);
                    } else if(id.state === 'volume_down'){
                        player.sendCommand('volume_down&step=' + this.config.volumeStepLevel);
                    } else if(id.state === 'auto_play'){
                        player.auto_play = state.val;
                    } else if(id.state === 'ignore_broadcast_cmd'){
                        player.ignore_broadcast_cmd = state.val;
                    }
                }
            }
        }
	}
    
	async onNodeSSDPResponse(headers, statusCode, rinfo) {
        try {
            // rinfo {"address":"192.168.2.225","family":"IPv4","port":53871,"size":430}
            if (typeof this.net_client == 'undefined') {
                if (headers.ST !== this.ssdpSearchTargetName) { // korrektes SSDP
                    this.log.debug('onNodeSSDPResponse: Getting wrong SSDP entry. Keep trying...');
                } else {
                    if (this.ssdpSearchInterval) {
                        clearInterval(this.ssdpSearchInterval);
                        this.ssdpSearchInterval = undefined;
                    }

                    this.ip = rinfo.address;
                    this.log.info('connecting to HEOS (' + this.ip + ') ...');
                    this.net_client = net.connect({ host: this.ip, port: 1255 });
                    this.net_client.setKeepAlive(true, 60000);
                    //this.net_client.setNoDelay(true);
                    this.net_client.setTimeout(60000);

                    this.state = States.Connecting;

                    this.net_client.on('error', (error) => {
                        this.log.error(error + '');
                        this.reconnect();
                    });

                    this.net_client.on('connect', async () => {
                        await this.setStateAsync("connected", true);
                        this.setStateChanged('info.connection', true, true);

                        this.state = States.Connected;
                        this.log.info('connected to HEOS (' + this.ip + ')');
                        this.getPlayers();
                        this.registerChangeEvents(true);
                        this.signIn();
                        this.startHeartbeat();
                    });

                    // Gegenseite hat die Verbindung geschlossen 
                    this.net_client.on('end', () => {
                        this.log.warn('HEOS closed the connection to ' + this.ip);
                        this.reconnect();
                    });

                    // timeout
                    this.net_client.on('timeout', () => {
                        this.log.warn('timeout trying connect to ' + this.ip);
                        this.reconnect();
                    });

                    // Datenempfang
                    this.net_client.on('data', (data) => this.onData(data));
                }
            }
        } catch (err) { this.log.error('onNodeSSDPResponse: ' + err.message); }
    }
    
    executeCommand(cmd) {
        //('command: '+cmd);

        // cmd auswerten
        cmd = cmd.split('/');
        var cmd_group = null;
        if(cmd.length > 1){
            cmd_group = cmd.shift();
            cmd = cmd.join('/');
        } else {
            cmd = cmd[0];
        }
        var commandFallback = false;
        switch (cmd_group) {
            case 'system':
                switch (cmd) {
                    case 'load_sources':
                        this.getMusicSources();
                        break;
                    case 'connect':
                        this.disconnect();
                        this.connect();
                        break;
                    case 'disconnect':
                        this.disconnect();
                        break;
                    case 'reconnect':
                        this.reconnect();
                        break;
                    case 'reboot':
                        this.reboot();
                        break;
                    default:
                        commandFallback = true;
                        break;
                }
                break;
            case 'group':
                switch (cmd) {
                    case 'get_groups':
                        this.getGroups();
                        break;
                    case 'ungroup_all':
                        this.ungroupAll();
                        break;
                    case 'group_all':
                        this.groupAll();
                        break;
                    default:
                        commandFallback = true;
                        break;
                }
                break;
            case 'player':
                this.sendCommandToAllPlayers(cmd, false);
                break;
            default:
                commandFallback = true;
                break;
        }

        if (commandFallback && this.state == States.Connected) {
            if(cmd_group == null){
                this.msgs.push('heos://' + cmd + '\n');
            } else {
                this.msgs.push('heos://' + cmd_group + '/' + cmd + '\n');
            }
            this.sendNextMsg();
        }
    }

	setLastError(error) {
        this.getState('error',  async (err, state) => {
            if(state && state.val !== true){
                await this.setStateAsync('error', true);
            }
        })
        this.getState('last_error',  async (err, state) => {
            if(state) {
                try {
                    this.log.warn(error);
                    let val = state.val + '';
                    let lines = val.split('\n');
                    if(lines.includes(error))
                        lines.splice(lines.indexOf(error), 1);
                    if (lines.length > 4)
                        lines.pop();
                    lines.unshift(error);
                    await this.setStateAsync('last_error', lines.join('\n'), true);
                } catch (e) { this.log.error('setLastError: ' + e.message); }
            }
        });
    }


    /** es liegen Antwort(en) vor
     * 
     * {"heos": {"command": "browse/browse", "result": "success", "message": "sid=1028&returned=9&count=9"}, 
     *    "payload": [
     *        {"container": "no", "mid": "s25529", "type": "station", "playable": "yes", "name": "NDR 1 Niedersachsen (Adult Hits)", "image_url": "http://cdn-profiles.tunein.com/s25529/images/logoq.png?t=154228"}, 
     *        {"container": "no", "mid": "s56857", "type": "station", "playable": "yes", "name": "NDR 2 Niedersachsen 96.2 (Top 40 %26 Pop Music)", "image_url": "http://cdn-profiles.tunein.com/s56857/images/logoq.png?t=154228"}, 
     *        {"container": "no", "mid": "s24885", "type": "station", "playable": "yes", "name": "NDR Info", "image_url": "http://cdn-profiles.tunein.com/s24885/images/logoq.png?t=1"}, {"container": "no", "mid": "s158432", "type": "station", "playable": "yes", "name": "Absolut relax (Easy Listening Music)", "image_url": "http://cdn-radiotime-logos.tunein.com/s158432q.png"}, 
     *        {"container": "no", "mid": "catalog/stations/A316JYMKQTS45I/#chunk", "type": "station", "playable": "yes", "name": "Johannes Oerding", "image_url": "https://images-na.ssl-images-amazon.com/images/G/01/Gotham/DE_artist/JohannesOerding._SX200_SY200_.jpg"}, 
     *        {"container": "no", "mid": "catalog/stations/A1O1J39JGVQ9U1/#chunk", "type": "station", "playable": "yes", "name": "Passenger", "image_url": "https://images-na.ssl-images-amazon.com/images/I/71DsYkU4QaL._SY500_CR150,0,488,488_SX200_SY200_.jpg"}, 
     *        {"container": "no", "mid": "catalog/stations/A1W7U8U71CGE50/#chunk"
     **/
    onData(data) {
        this.log.debug("onData: " + data.toString())
        try {
            data = data.toString();
            data = data.replace(/[\n\r]/g, '');    // Steuerzeichen "CR" entfernen   
            // es können auch mehrere Antworten vorhanden sein! {"heos": ... } {"heos": ... }
            // diese nun in einzelne Antworten zerlegen
            data = this.unfinishedResponses + data;
            this.unfinishedResponses = '';

            var responses = data.split(/(?={"heos")/g);
            for (var r = 0; r < responses.length; r++) {
                if (responses[r].trim().length > 0) {
                    try {
                        JSON.parse(responses[r]); // check ob korrektes JSON Array
                        this.parseResponse(responses[r]);
                    } catch (e) {
                        this.log.debug('onData: invalid json (error: ' + e.message + '): ' + responses[r]);
                        this.unfinishedResponses += responses[r];
                    }
                }
            }
            // wenn weitere Msg zum Senden vorhanden sind, die nächste senden
            if (this.msgs.length > 0)
                this.sendNextMsg();
        } catch (err) { this.log.error('onData: ' + err.message); }
	}
	
	parseMessage(message) {
        var result = {};
        if(message != null && message.trim().length > 0) {
            var params = message.split('&');
            for (var i = 0; i < params.length; i++) {
                var entry = params[i];
                entry = decodeURI(entry);
                var param = entry.split('=');
                if(param.length > 1){
                    result[param[0]] = param[1];
                } else {
                    result[param[0]] = null;
                }
            }
        }
        return result;
    }

    async createSource(devicePath, source){
        var baseStatePath = devicePath + '.' + source.sid;
        var statePath = baseStatePath + '.';
        //Channel
        await this.setObjectNotExistsAsync(baseStatePath, {
            type: 'channel',
            common: {
                name: source.name,
                role: 'media.source'
            },
            native: {},
        });

        //States
        await this.setObjectNotExistsAsync(statePath + 'sid', {
            type: 'state',
            common: {
                name: 'Source ID',
                desc: 'ID of the source',
                type: 'number',
                role: 'media.sid',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'name', {
            type: 'state',
            common: {
                name: 'Source name',
                desc: 'Name of the source',
                type: 'string',
                role: 'media.name',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'type', {
            type: 'state',
            common: {
                name: 'Source type',
                desc: 'Type of the source',
                type: 'string',
                role: 'media.type',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'image_url', {
            type: 'state',
            common: {
                name: 'Source image url',
                desc: 'Image URL of the source',
                type: 'string',
                role: 'media.image_url',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });

        await this.setStateAsync(statePath + 'sid', source.sid, true);
        await this.setStateAsync(statePath + 'name', source.name, true);
        await this.setStateAsync(statePath + 'type', source.type, true);
        await this.setStateAsync(statePath + 'image_url', source.image_url, true);

        //Browse Playlists & Favorites
        if ([1025, 1028].includes(source.sid)) {
            this.browse(source.sid);
        }
    }

    async createPlaylist(devicePath, payload){
        var itemId = payload.cid;
        var baseStatePath = devicePath + '.' + itemId;
        var statePath = baseStatePath + '.';
        //Channel
        await this.setObjectNotExistsAsync(baseStatePath, {
            type: 'channel',
            common: {
                name: payload.name || 'Playlist ' + itemId,
                role: 'media.playlist'
            },
            native: {},
        });

        //States
        await this.setObjectNotExistsAsync(statePath + 'id', {
            type: 'state',
            common: {
                name: 'Playlist ID',
                desc: 'ID of the playlist',
                type: 'number',
                role: 'media.id',
                read: true,
                write: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'name', {
            type: 'state',
            common: {
                name: 'Playlist name',
                desc: 'Name of the playlist',
                type: 'string',
                role: 'media.name',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'playable', {
            type: 'state',
            common: {
                name: 'Playable',
                desc: 'Playlist is playable',
                type: 'boolean',
                role: 'media.playable',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        if(payload.playable == 'yes'){
            await this.setObjectNotExistsAsync(statePath + 'play', {
                type: 'state',
                common: {
                    name: 'Play',
                    desc: 'Play on all players',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: false
                },
                native: {},
            });
        }
        await this.setObjectNotExistsAsync(statePath + 'type', {
            type: 'state',
            common: {
                name: 'Playlist type',
                desc: 'Type of the playlist',
                type: 'string',
                role: 'media.type',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'image_url', {
            type: 'state',
            common: {
                name: 'Playlist image url',
                desc: 'Image URL of the playlist',
                type: 'string',
                role: 'media.image_url',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'container', {
            type: 'state',
            common: {
                name: 'Container',
                desc: 'True, if the playlist is a container',
                type: 'boolean',
                role: 'media.container',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        if(payload.container == 'yes'){
            await this.setObjectNotExistsAsync(statePath + 'cid', {
                type: 'state',
                common: {
                    name: 'Container ID',
                    desc: 'ID of the container',
                    type: 'string',
                    role: 'media.cid',
                    read: true,
                    write: false,
                    def: ''
                },
                native: {},
            });
        } else {
            await this.setObjectNotExistsAsync(statePath + 'mid', {
                type: 'state',
                common: {
                    name: 'Media ID',
                    desc: 'ID of the media',
                    type: 'string',
                    role: 'media.mid',
                    read: true,
                    write: false,
                    def: ''
                },
                native: {},
            });
        }

        await this.setStateAsync(statePath + 'id', itemId, true);
        await this.setStateAsync(statePath + 'name', payload.name, true);
        await this.setStateAsync(statePath + 'playable', (payload.playable == 'yes' ? true : false), true);
        if(payload.playable == 'yes'){
            await this.setStateAsync(statePath + 'play', (payload.playable == 'yes' ? true : false), true);
        }
        await this.setStateAsync(statePath + 'type', payload.type, true);
        await this.setStateAsync(statePath + 'image_url', payload.image_url, true);
        await this.setStateAsync(statePath + 'container', (payload.container == 'yes' ? true : false), true);
        if(payload.container == 'yes'){
            await this.setStateAsync(statePath + 'cid', payload.cid, true);
        } else {
            await this.setStateAsync(statePath + 'mid', payload.mid, true);
        }
    }

    async createPreset(devicePath, itemId, payload){
        var baseStatePath = devicePath + '.' + itemId;
        var statePath = baseStatePath + '.';

        //Channel
        await this.setObjectNotExistsAsync(baseStatePath, {
            type: 'channel',
            common: {
                name: 'Preset ' + itemId,
                role: 'media.preset'
            },
            native: {},
        });

        //States
        await this.setObjectNotExistsAsync(statePath + 'id', {
            type: 'state',
            common: {
                name: 'Preset ID',
                desc: 'ID of the preset',
                type: 'number',
                role: 'media.id',
                read: true,
                write: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'name', {
            type: 'state',
            common: {
                name: 'Preset name',
                desc: 'Name of the preset',
                type: 'string',
                role: 'media.name',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'playable', {
            type: 'state',
            common: {
                name: 'Playable',
                desc: 'Preset is playable',
                type: 'boolean',
                role: 'media.playable',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        if(payload.playable == 'yes'){
            await this.setObjectNotExistsAsync(statePath + 'play', {
                type: 'state',
                common: {
                    name: 'Play',
                    desc: 'Play on all players',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: false
                },
                native: {},
            });
        }
        await this.setObjectNotExistsAsync(statePath + 'type', {
            type: 'state',
            common: {
                name: 'Preset type',
                desc: 'Type of the preset',
                type: 'string',
                role: 'media.type',
                read: true,
                write: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'image_url', {
            type: 'state',
            common: {
                name: 'Preset image url',
                desc: 'Image URL of the preset',
                type: 'string',
                role: 'media.image_url',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(statePath + 'container', {
            type: 'state',
            common: {
                name: 'Container',
                desc: 'True, if the preset is a container',
                type: 'boolean',
                role: 'media.container',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        if(payload.container == 'yes'){
            await this.setObjectNotExistsAsync(statePath + 'cid', {
                type: 'state',
                common: {
                    name: 'Container ID',
                    desc: 'ID of the container',
                    type: 'string',
                    role: 'media.cid',
                    read: true,
                    write: false,
                    def: ''
                },
                native: {},
            });
        } else {
            await this.setObjectNotExistsAsync(statePath + 'mid', {
                type: 'state',
                common: {
                    name: 'Media ID',
                    desc: 'ID of the media',
                    type: 'string',
                    role: 'media.mid',
                    read: true,
                    write: false,
                    def: ''
                },
                native: {},
            });
        }

        await this.setStateAsync(statePath + 'id', itemId, true);
        await this.setStateAsync(statePath + 'name', payload.name, true);
        await this.setStateAsync(statePath + 'playable', (payload.playable == 'yes' ? true : false), true);
        if(payload.playable == 'yes'){
            await this.setStateAsync(statePath + 'play', (payload.playable == 'yes' ? true : false), true);
        }
        await this.setStateAsync(statePath + 'type', payload.type, true);
        await this.setStateAsync(statePath + 'image_url', payload.image_url, true);
        await this.setStateAsync(statePath + 'container', (payload.container == 'yes' ? true : false), true);
        if(payload.container == 'yes'){
            await this.setStateAsync(statePath + 'cid', payload.cid, true);
        } else {
            await this.setStateAsync(statePath + 'mid', payload.mid, true);
        }
    }

    /** Antwort(en) verarbeiten.
     **/
    async parseResponse(response) {
        try {
            this.log.debug('parseResponse: ' + response);

            if (response.indexOf("command under process") > 0)
                return

            var i;
            var jdata = JSON.parse(response);
            if (!jdata.hasOwnProperty('heos') || !jdata.heos.hasOwnProperty('command'))
                return;

            // msg auswerten
            var jmsg = this.parseMessage(jdata.heos.message);

            // result ?
            var result = 'success';
            if (jdata.heos.hasOwnProperty('result')) result = jdata.heos.result;
            if (result != 'success') {
                switch(jmsg.text){
                    case 'User_not_logged_in':
                        await this.setStateAsync('signed_in', false, true);
                        await this.setStateAsync('signed_in_user', "", true);
                        this.signIn();
                        break;
                    case 'Processing previous command':
                        this.reboot();
                        break;
                }
                this.setLastError('result=' + result + ',text=' + jmsg.text + ",command=" + jdata.heos.command);
                return; //Stop Parsing, because of error
            } else {
                this.getState('error',  async (err, state) => {
                    if(state && state.val !== false){
                        await this.setStateAsync('error', false, true);
                    }
                });
            }

            // cmd auswerten
            var cmd = jdata.heos.command.split('/');
            var cmd_group = cmd[0];
            cmd = cmd[1];
            switch (cmd_group) {
                case 'system':
                    switch (cmd) {
                        case 'heart_beat':
                            this.resetHeartbeatRetries(true);
                            break;
                        case 'sign_in':
                            await this.setStateAsync('signed_in', true, true);
                            await this.setStateAsync('signed_in_user', jmsg.un, true);
                            this.getMusicSources();
                            break;
                    }
                    break;
                case 'event':
                    switch (cmd) {
                        case 'user_changed':
                            this.log.debug("sign: " + JSON.stringify(jmsg));
                            if('signed_in' in jmsg){
                                await this.setStateAsync('signed_in', true, true);
                                await this.setStateAsync('signed_in_user', jmsg.un, true);
                            } else {
                                await this.setStateAsync('signed_in', false, true);
                                await this.setStateAsync('signed_in_user', "", true);
                                this.signIn();
                            }
                            break;
                        case 'players_changed':
                            this.getPlayers();
                            break;
                        case 'groups_changed':
                            this.getGroups();
                            break;
                        case 'group_volume_changed':
                            // "heos": {"command": "event/group_volume_changed ","message": "gid='group_id'&level='vol_level'&mute='on_or_off'"}
                            if (jmsg.hasOwnProperty('gid')) {
                                if (jmsg.hasOwnProperty('level')) {
                                    let leadHeosPlayer = this.players.get(jmsg.gid);
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (let i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players.get(pid);
                                            if (heosPlayer) {
                                                heosPlayer.setGroupVolume(jmsg.level);
                                            }
                                        }
                                    }
                                }
                                if (jmsg.hasOwnProperty('mute')) {
                                    let leadHeosPlayer = this.players.get(jmsg.gid);
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (let i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players.get(pid);
                                            if (heosPlayer) {
                                                heosPlayer.setGroupMuted(jmsg.mute == 'on' ? true : false)
                                            }
                                        }
                                    }
                                }
                            }
                            break;
                    }
                    break;
                case 'player':
                    switch (cmd) {
                        // {"heos": {"command": "player/get_players", "result": "success", "message": ""}, 
                        //  "payload": [{"name": "HEOS Bar", "pid": 1262037998, "model": "HEOS Bar", "version": "1.430.160", "ip": "192.168.2.225", "network": "wifi", "lineout": 0, "serial": "ADAG9170202780"}, 
                        //              {"name": "HEOS 1 rechts", "pid": -1746612370, "model": "HEOS 1", "version": "1.430.160", "ip": "192.168.2.201", "network": "wifi", "lineout": 0, "serial": "AMWG9170934429"}, 
                        //              {"name": "HEOS 1 links", "pid": 68572158, "model": "HEOS 1", "version": "1.430.160", "ip": "192.168.2.219", "network": "wifi", "lineout": 0, "serial": "AMWG9170934433"}
                        //             ]}
                        case 'get_players':
                            if (jdata.hasOwnProperty('payload')) {
                                this.startPlayers(jdata.payload);
                            }
                            break;
                    }
                    break;

                // {"heos": {"command": "browse/get_music_sources", "result": "success", "message": ""}, 
                //  "payload": [{"name": "Amazon", "image_url": "https://production...png", "type": "music_service", "sid": 13}, 
                //              {"name": "TuneIn", "image_url": "https://production...png", "type": "music_service", "sid": 3}, 
                //              {"name": "Local Music", "image_url": "https://production...png", "type": "heos_server", "sid": 1024}, 
                //              {"name": "Playlists", "image_url": "https://production...png", "type": "heos_service", "sid": 1025}, 
                //              {"name": "History", "image_url": "https://production...png", "type": "heos_service", "sid": 1026}, 
                //              {"name": "AUX Input", "image_url": "https://production...png", "type": "heos_service", "sid": 1027}, 
                //              {"name": "Favorites", "image_url": "https://production...png", "type": "heos_service", "sid": 1028}]}
                case 'browse':
                    switch (cmd) {
                        case 'get_music_sources':
                            if ((jdata.hasOwnProperty('payload'))) {
                                var devicePath = 'sources'
                                //Device
                                await this.setObjectNotExistsAsync(devicePath, {
                                    type: 'device',
                                    common: {
                                        name: 'Sources',
                                        role: 'media.sources'
                                    },
                                    native: {},
                                });
                                
                                for (i = 0; i < jdata.payload.length; i++) {
                                    await this.createSource(devicePath, jdata.payload[i]);
                                }
                            }
                            break;

                        // {"heos": {"command": "browse/browse", "result": "success", "message": "pid=1262037998&sid=1028&returned=5&count=5"}, 
                        //  "payload": [{"container": "no", "mid": "s17492", "type": "station", "playable": "yes", "name": "NDR 2 (Adult Contemporary Music)", "image_url": "http://cdn-radiotime-logos.tunein.com/s17492q.png"}, 
                        //              {"container": "no", "mid": "s158432", "type": "station", "playable": "yes", "name": "Absolut relax (Easy Listening Music)", "image_url": "http://cdn-radiotime-logos.tunein.com/s158432q.png"}, 
                        //              {"container": "no", "mid": "catalog/stations/A1W7U8U71CGE50/#chunk", "type": "station", "playable": "yes", "name": "Ed Sheeran", "image_url": "https://images-na.ssl-images-amazon.com/images/G/01/Gotham/DE_artist/EdSheeran._SX200_SY200_.jpg"}, 
                        //              {"container": "no", "mid": "catalog/stations/A1O1J39JGVQ9U1/#chunk", "type": "station", "playable": "yes", "name": "Passenger", "image_url": "https://images-na.ssl-images-amazon.com/images/I/71DsYkU4QaL._SY500_CR150,0,488,488_SX200_SY200_.jpg"}, 
                        //              {"container": "no", "mid": "catalog/stations/A316JYMKQTS45I/#chunk", "type": "station", "playable": "yes", "name": "Johannes Oerding", "image_url": "https://images-na.ssl-images-amazon.com/images/G/01/Gotham/DE_artist/JohannesOerding._SX200_SY200_.jpg"}], 
                        //  "options": [{"browse": [{"id": 20, "name": "Remove from HEOS Favorites"}]}]}                    
                        case 'browse':
                            if ((jdata.hasOwnProperty('payload'))) {
                                switch(parseInt(jmsg.sid, 10)){
                                    case 1025:
                                        var devicePath = 'playlists'
                                        //Device
                                        await this.setObjectNotExistsAsync(devicePath, {
                                            type: 'device',
                                            common: {
                                                name: 'Playlists',
                                                role: 'media.playlists'
                                            },
                                            native: {},
                                        });
                                        for (i = 0; i < jdata.payload.length; i++) {
                                            await this.createPlaylist(devicePath, jdata.payload[i]);
                                        }
                                        break;
                                    case 1028:
                                        var devicePath = 'presets'
                                        //Device
                                        await this.setObjectNotExistsAsync(devicePath, {
                                            type: 'device',
                                            common: {
                                                name: 'Presets',
                                                role: 'media.presets'
                                            },
                                            native: {},
                                        });

                                        for (i = 0; i < jdata.payload.length; i++) {
                                            var itemId = (i + 1);
                                            await this.createPreset(devicePath, itemId, jdata.payload[i]);
                                        }
                                        break;
                                }
                            }
                            break;
                    }
                    break;

                case 'group':
                    switch (cmd) {
                        // { "heos":{"command":"player/set_group","result":"success",
                        //           "message": "gid='new group_id'&name='group_name'&pid='player_id_1, player_id_2,…,player_id_n'
                        //          } 
                        // }
                        case 'set_group':
                            //Ignorieren, da jmsg falsche Daten enthält. Get-groups enthält die korrekten Daten.
                            //this.setGroup(jmsg);
                            break;

                        // { "heos": {"command":"group/get_volume","result":"success","message": "gid='group_id'&level='vol_level'"}
                        case 'get_volume':
                            if (jmsg.hasOwnProperty('gid')) {
                                if (jmsg.hasOwnProperty('level')) {
                                    let leadHeosPlayer = this.players.get(jmsg.gid);
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (let i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players.get(pid);
                                            if (heosPlayer) {
                                                heosPlayer.setGroupVolume(jmsg.level);
                                            }
                                        }
                                    }
                                }
                            }
                            break;

                        // { "heos": {"command":"group/get_mute","result":"success","message": "gid='group_id'&state='on_or_off'"}
                        case 'get_mute':
                            if (jmsg.hasOwnProperty('gid')) {
                                if (jmsg.hasOwnProperty('state')) {
                                    let leadHeosPlayer = this.players.get(jmsg.gid);
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (let i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players.get(pid);
                                            if (heosPlayer) {
                                                heosPlayer.setGroupMuted(jmsg.state == 'on' ? true : false);
                                            }
                                        }
                                    }
                                }
                            }
                            break;


                        // { "heos": { "command": "player/get_groups", "result": "success", "message": "" },
                        //   "payload": [{"name":"'group name 1'", "gid": "group id 1'",
                        //                "players":[{"name":"player name 1","pid":"'player id1'","role":"player role 1 (leader or member)'"},
                        //                           {"name":"player name 2","pid":"'player id2'","role":"player role 2 (leader or member)'"} 
                        //                          ]
                        //               },
                        //               {"name":"'group name 2'","gid":"group id 2'",
                        //                "players":[{"name":"player name ... 
                        case 'get_groups':
                            // bisherige groups leeren
                            for (let [pid, player] of this.players) {
                                await player.setGroupName('');
                                await player.setGroupPid('');
                                await player.setGroupLeaderPid('');
                                await player.setGroupLeader(false);
                                await player.setGroupMember(false);
                            }

                            // payload mit den groups auswerten
                            if ((jdata.hasOwnProperty('payload'))) {
                                for (i = 0; i < jdata.payload.length; i++) {
                                    var group = jdata.payload[i];
                                    var players = group.players;
                                    // Player IDs addieren. Hinweis: "leader" ist nicht immer der 1.Playereintrag
                                    group.pid = "";
                                    for (var p = 0; p < players.length; p++) {
                                        if (players[p].role == 'leader')
                                            group.pid = players[p].pid + (group.pid.length > 0 ? "," : "") + group.pid;
                                        else
                                            group.pid = group.pid + (group.pid.length > 0 ? "," : "") + players[p].pid;
                                    }
                                    this.setGroup(group);
                                }
                            }
                            break;

                    }
                    break;


                case 'system':
                    switch (cmd) {
                        case 'sign_in':
                            this.log.info('signed in: ' + jdata.heos.result);
                            break;
                    }
                    break;
            }

            // an die zugehörigen Player weiterleiten
            if (jmsg.hasOwnProperty('pid')) {
                let heosPlayer = this.players.get(jmsg.pid);
                if (heosPlayer) {
                    heosPlayer.parseResponse(jdata, jmsg, cmd_group, cmd)
                }
            }

		} catch (err) { this.log.error('parseResponse: ' + err.message + '\n ' + response); }
    }

    sendCommandToAllPlayers(cmd, leaderOnly){
        if (this.state == States.Connected) {
            for (let [pid, player] of this.players) {
                if(player.ignore_broadcast_cmd === false && (!leaderOnly || (leaderOnly && player.isPlayerLeader()))){
                    player.sendCommand(cmd);
                }
            }
        }
    }

    /**
     * 
     * @param {String} pid 
     */
    async stopPlayer(pid){
        let player = this.players.get(pid);
        if(player){
            await player.disconnect();
        }
        // player leeren
        this.players.delete(pid);
    }

    // Für die gefundenen HEOS Player entsprechende class HeosPlayer Instanzen bilden und nicht mehr verbundene Player stoppen
    async startPlayers(payload) {
        try {
            var connectedPlayers = [];
            for (var i = 0; i < payload.length; i++) {
                var player = payload[i];
                var pid = player.pid + ''; //Convert to String
                if(!(this.players.has(pid))){
                    let heosPlayer = new HeosPlayer(this, player);
                    this.players.set(pid, heosPlayer);
                    await heosPlayer.connect();
                }
                connectedPlayers.push(pid);
            }
            //Remove disconnected players
            for (let [pid, player] of this.players) {
                if(!connectedPlayers.includes(pid)){
                    this.stopPlayer(pid);
                }
            }
            this.getGroups();
        } catch (err) { this.log.error('startPlayers: ' + err.message); }
    }

    //Alle Player stoppen
    stopPlayers() {
        this.log.debug("try to stop players:" + Array.from(this.players.keys()).join(','));
        for (let [pid, player] of this.players) {
            this.stopPlayer(pid);
        }
    }

    getPlayers() {
        if (this.state == States.Connected) {
            this.msgs.push('heos://player/get_players\n');
            this.sendNextMsg();
        }
    }

    // setzen der Werte einer Group
    async setGroup(group) {
        if (group.hasOwnProperty('pid')) {
            // in den Playern den Groupstatus setzen
            var pids = group.pid.split(',');

            for (var i = 0; i < pids.length; i++) {
                let pid = pids[i];
                let player = this.players.get(pid);
                if (player) {
                    await player.setGroupName((group.hasOwnProperty('name') ? group.name : ''));
                    await player.setGroupPid(group.pid);
                    await player.setGroupLeader((i == 0) && (pids.length > 1));
                    await player.setGroupLeaderPid(pids[0]);
                    await player.setGroupMember(pids.length > 1);
                }
            }

            if (group.hasOwnProperty('gid')) {
                // volume und mute dazu holen
                this.executeCommand("group/get_volume?gid=" + group.gid);
                this.executeCommand("group/get_mute?gid=" + group.gid);
            }
        }
    }

    getGroups() {
        if (this.state == States.Connected) {
            // heos://group/get_groups
            this.msgs.push('heos://group/get_groups');
            this.sendNextMsg();
        }
    }

    ungroupAll() {
        if (this.state == States.Connected) {
            for (let [pid, player] of this.players) {
                if(player.group_leader === true){
                    this.msgs.push('heos://group/set_group?pid=' + pid);
                    this.sendNextMsg();
                }
            }
        }
    }

    groupAll() {
        if (this.state == States.Connected) {
            let pids = Array.from(this.players.keys()).join(',');
            this.msgs.push('heos://group/set_group?pid=' + pids);
            this.sendNextMsg();
        }
    }

    getMusicSources() {
        if (this.state == States.Connected) {
            // heos://browse/get_music_sources
            this.msgs.push('heos://browse/get_music_sources');
            this.sendNextMsg();
        }
    }
    
    signIn() {
        if (this.state == States.Connected) {
            // heos://system/sign_in?un=heos_username&pw=heos_password
            this.msgs.push('heos://system/sign_in?un=' + this.config.username + '&pw=' + this.config.password);
            this.sendNextMsg();
        }
    }

    reboot() {
        if (this.state == States.Connected || this.state == States.Reconnecting || this.state == States.Disconnecting) {
            this.log.debug("reboot device");
            // heos://system/reboot
            this.msgs.push('heos://system/reboot');
            this.sendNextMsg();
            setTimeout(() => {
                this.reconnect();
            }, 1000)
        }
    }

    browse(sid) {
        if (this.state == States.Connected) {
            // heos://browse/browse?sid=source_id
            this.msgs.push('heos://browse/browse?sid=' + sid);
            this.sendNextMsg();
        }
    }

    registerChangeEvents(b) {
        if (this.state == States.Connected || this.state == States.Reconnecting || this.state == States.Disconnecting) {
            if (b) this.msgs.push('heos://system/register_for_change_events?enable=on');
            else this.msgs.push('heos://system/register_for_change_events?enable=off');
            this.sendNextMsg();
        }
    }
	
	startHeartbeat() {
        if (this.state == States.Connected) {
            this.log.debug("[HEARTBEAT] start interval");
            this.heartbeatInterval = setInterval(() => {
                this.log.debug("[HEARTBEAT] ping")
                this.msgs.push('heos://system/heart_beat');
                this.sendNextMsg();
                this.heartbeatRetries += 1;
                if(this.heartbeatRetries >= this.config.heartbeatRetries){
                    this.log.warn("[HEARTBEAT] retries exceeded");
                    this.resetHeartbeatRetries(false);
                    this.reboot();
                }
            }, this.config.heartbeatInterval);
        }
    }

    resetHeartbeatRetries(pong) {
        if(pong){
            this.log.debug("[HEARTBEAT] pong");
        } else {
            this.log.debug("[HEARTBEAT] reset retries");
        }
        this.heartbeatRetries = 0;
    }

    stopHeartbeat() {
        this.log.debug("[HEARTBEAT] Stop interval");
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        this.resetHeartbeatRetries(false);
	}
	
	sendNextMsg() {
        if (this.msgs.length > 0) {
            var msg = this.msgs.shift();
            this.sendMsg(msg);
        }
    }

    // Nachricht an player senden
    sendMsg(msg) {
        if(this.net_client){
            try {
                this.net_client.write(msg + "\n");
            } catch (err) { 
                this.log.error('sendMsg: ' + err.message);
                this.reconnect();
            }
            this.log.debug("data sent: " + msg);
        }
    }

    /** Verbindung zum HEOS System herstellen **/
    connect() {
        try {
            this.log.info("searching for HEOS devices ...")
            this.setState("connected", false);
			this.state = States.Searching;
			
            const NodeSSDP = require('node-ssdp').Client;
            this.nodessdp_client = new NodeSSDP();
            this.nodessdp_client.explicitSocketBind = true;
            this.nodessdp_client.on('response', (headers, statusCode, rinfo) => this.onNodeSSDPResponse(headers, statusCode, rinfo));
            this.nodessdp_client.on('error', error => { this.nodessdp_client.close(); this.log.error(error); });
            this.nodessdp_client.search(this.ssdpSearchTargetName);
            if (this.ssdpSearchInterval) {
                clearInterval(this.ssdpSearchInterval);
                this.ssdpSearchInterval = undefined;
            }
            this.ssdpSearchInterval = setInterval(() => {
                this.log.info("still searching for HEOS devices ...")
                this.nodessdp_client.search(this.ssdpSearchTargetName);
            }, this.config.searchInterval);
        } catch (err) { this.log.error('connect: ' + err.message); }
	}

	/** Alle Player stoppen und die TelNet Verbindung schließen **/
    disconnect() {
        this.log.info('disconnecting from HEOS ...');
        this.state = States.Disconnecting;

        this.stopHeartbeat();
        this.stopPlayers();

        if (typeof this.net_client !== 'undefined') {
            this.registerChangeEvents(false);
            this.net_client.destroy();
            this.net_client.unref();
            this.net_client = undefined;
        }
        if (typeof this.nodessdp_client !== 'undefined') {
            this.nodessdp_client.stop();
            this.nodessdp_client = undefined;
        }
        this.setState("error", false);
        this.setState("last_error", "");
        this.setState("connected", false);
        this.setState('signed_in', false);
        this.setState('signed_in_user', "");

        this.state = States.Disconnected;
        this.ip = '';
        this.msgs = [];
        this.unfinishedResponses = '';

        this.setStateChanged('info.connection', false, true);
        this.log.info('disconnected from HEOS');
	}
	
	reconnect() {
        if(this.state == States.Reconnecting || this.state == States.Disconnecting) return;

        this.log.info('reconnecting to HEOS ...');
        this.disconnect();
        this.state = States.Reconnecting;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, this.config.reconnectTimeout);
    }

    main() {
        this.connect();
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
     * @type Heos
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Heos(options);
} else {
	// otherwise start the instance directly
    new Heos();
}