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

		this.init();
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
            } else if (id.device === 'players' && id.channel && id.state && this.players[id.channel]) {
                let player = this.players[id.channel];
                if(id.state === 'muted'){
                    this.sendCommandToPlayer(player.pid, 'set_mute&state=' + (state.val === true ? 'on' : 'off'));
                } else if(id.state === 'repeat'){
                    this.sendCommandToPlayer(player.pid, 'set_play_mode&repeat=' + state.val);
                } else if(id.state === 'shuffle'){
                    this.sendCommandToPlayer(player.pid, 'set_play_mode&shuffle=' + (state.val === true ? 'on' : 'off'));
                } else if(id.state === 'state'){
                    this.sendCommandToPlayer(player.pid, 'set_play_state&state=' + state.val);
                } else if(id.state === 'volume'){
                    this.sendCommandToPlayer(player.pid, 'set_volume&level=' + state.val);
                } else if(id.state === 'group_volume'){
                    if(player.group_member === true){
                        var gid = player.group_pid.split(",")[0];
                        this.sendCommandToPlayer(player.pid, 'group/set_volume?gid=' + gid + '&level=' + state.val);
                    }
                } else if(id.state === 'group_muted'){
                    if(player.group_member === true){
                        var gid = player.group_pid.split(",")[0];
                        this.sendCommandToPlayer(player.pid, 'group/set_mute?gid=' + gid + '&state=' + (state.val === true ? 'on' : 'off'));
                    }
                } else if(id.state === 'command'){
                    this.sendCommandToPlayer(player.pid, state.val);
                } else if(id.state === 'play'){
                    this.sendCommandToPlayer(player.pid, 'set_play_state&state=play');
                } else if(id.state === 'pause'){
                    this.sendCommandToPlayer(player.pid, 'set_play_state&state=pause');
                } else if(id.state === 'stop'){
                    this.sendCommandToPlayer(player.pid, 'set_play_state&state=stop');
                } else if(id.state === 'prev'){
                    this.sendCommandToPlayer(player.pid, 'play_previous');
                } else if(id.state === 'next'){
                    this.sendCommandToPlayer(player.pid, 'play_next');
                } else if(id.state === 'volume_up'){
                    this.sendCommandToPlayer(player.pid, 'volume_up&step=' + this.config.volumeStepLevel);
                } else if(id.state === 'volume_down'){
                    this.sendCommandToPlayer(player.pid, 'volume_down&step=' + this.config.volumeStepLevel);
                } else if(id.state === 'auto_play'){
                    player.auto_play = state.val;
                } else if(id.state === 'ignore_broadcast_cmd'){
                    player.ignore_broadcast_cmd = state.val;
                }
            }
        }
	}

    init() {
        this.players = {};
        this.heartbeatInterval = undefined;
        this.heartbeatRetries = 0;
        this.ssdpSearchInterval = undefined;
        this.reconnectTimeout = undefined;
        this.net_client = undefined;
        this.nodessdp_client = undefined;

        this.ip = '';
        this.msgs = [];
        this.state = States.Disconnected;
        this.unfinishedResponses = '';
        this.ssdpSearchTargetName = 'urn:schemas-denon-com:device:ACT-Denon:1';
    }

    async createPlayer(player, callback) {
        let baseStatePath = 'players.' + player.pid;
        player.statePath = baseStatePath + '.';
        player.group_member = false;
        player.group_leader = false;
        player.group_pid = '';
        player.state = 'stop';
        player.muted = false;
        player.connected = false;
        player.muted_ad = false;
        player.error = false;

        //Channel
        await this.setObjectNotExistsAsync(baseStatePath, {
            type: 'channel',
            common: {
                name: player.name || player.ip,
                role: 'media.music'
            },
            native: {},
        });

        //Meta
        await this.setObjectNotExistsAsync(player.statePath + 'connected', {
			type: 'state',
			common: {
                name: 'Connection status',
                desc: 'True, if HEOS player is connected',
				type: 'boolean',
				role: 'indicator.reachable',
				read: true,
                write: false,
                def: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'command', {
			type: 'state',
			common: {
                name: 'Player command',
                desc: 'Send command to player',
				type: 'string',
				role: 'media.command',
				read: true,
                write: true,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'ip', {
			type: 'state',
			common: {
                name: 'Player IP-Address',
                desc: 'IP Address of the player',
				type: 'string',
				role: 'meta.ip',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'pid', {
			type: 'state',
			common: {
                name: 'Player ID',
                desc: 'Unique ID of the player',
				type: 'string',
				role: 'meta.pid',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'name', {
			type: 'state',
			common: {
                name: 'Player name',
                desc: 'Name of the player',
				type: 'string',
				role: 'meta.name',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'model', {
			type: 'state',
			common: {
                name: 'Player model',
                desc: 'Model of the player',
				type: 'string',
				role: 'meta.model',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'serial', {
			type: 'state',
			common: {
                name: 'Player serial number',
                desc: 'Serial number of the player',
				type: 'string',
				role: 'meta.serial',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'network', {
			type: 'state',
			common: {
                name: 'Network connection type',
                desc: 'wired, wifi or unknown',
				type: 'string',
				role: 'meta.network',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'lineout', {
			type: 'state',
			common: {
                name: 'LineOut level type',
                desc: 'variable or fixed',
				type: 'number',
				role: 'meta.lineout',
				read: true,
                write: false,
                def: 0
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'error', {
			type: 'state',
			common: {
                name: 'Player error status',
                desc: 'True, if player has an error',
				type: 'boolean',
				role: 'media.error',
				read: true,
                write: false,
                def: false
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'last_error', {
			type: 'state',
			common: {
                name: 'Last player error messages',
                desc: 'Last 4 player error messages',
				type: 'string',
				role: 'media.last_error',
				read: true,
                write: false,
                def: ""
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'volume', {
			type: 'state',
			common: {
                name: 'Player volume',
                desc: 'State and control of volume',
				type: 'number',
				role: 'level.volume',
				read: true,
                write: true,
                def: 0
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'muted', {
            type: 'state',
            common: {
                name: 'Player mute',
                desc: 'Player is muted',
                type: 'boolean',
                role: 'media.mute',
                read: true,
                write: true,
                def: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'state', {
            type: 'state',
            common: {
                name: 'String state',
                desc: 'Play, stop, or pause',
                type: 'string',
                role: 'media.state',
                read: true,
                write: true,
                states: {
                    'stop': 'Stop',
                    'play': 'Play',
                    'pause': 'Pause'
                },
                def: 'stop'
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'repeat', {
            type: 'state',
            common: {
                name: 'Repeat',
                desc: 'Repeat mode',
                type: 'string',
                role: 'media.mode.repeat',
                read: true,
                write: true,
                states: {
                    'on_all':'on_all',
                    'on_one':'on_one',
                    'off':'off'
                },
                def: 'off'
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'shuffle', {
            type: 'state',
            common: {
                name: 'Shuffle',
                desc: 'Shuffle mode',
                type: 'boolean',
                role: 'media.mode.shuffle',
                read: true,
                write: true,
                def: false
            },
            native: {},
        });

        //Now playing
        await this.setObjectNotExistsAsync(player.statePath + 'current_type', {
            type: 'state',
            common: {
                name: 'Media Type',
                desc: 'Type of the media',
                type: 'string',
                role: 'media.type',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_title', {
            type: 'state',
            common: {
                name: 'Current title',
                desc: 'Title of current played song',
                type: 'string',
                role: 'media.title',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_station', {
            type: 'state',
            common: {
                name: 'Current station',
                desc: 'Title of current played station',
                type: 'string',
                role: 'media.station',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_album_id', {
            type: 'state',
            common: {
                name: 'Current album ID',
                desc: 'Album ID of current played song',
                type: 'string',
                role: 'media.album_id',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_album', {
            type: 'state',
            common: {
                name: 'Current album',
                desc: 'Album of current played song',
                type: 'string',
                role: 'media.album',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_artist', {
            type: 'state',
            common: {
                name: 'Current artist',
                desc: 'Artist of current played song',
                type: 'string',
                role: 'media.artist',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_image_url', {
            type: 'state',
            common: {
                name: 'Current cover URL',
                desc: 'Cover image of current played song',
                type: 'string',
                role: 'media.cover',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_mid', {
            type: 'state',
            common: {
                name: 'Current media ID',
                desc: 'Media ID of current played song',
                type: 'string',
                role: 'media.mid',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_sid', {
            type: 'state',
            common: {
                name: 'Current source ID',
                desc: 'Source ID of current played song',
                type: 'string',
                role: 'media.sid',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_qid', {
            type: 'state',
            common: {
                name: 'Current queue ID',
                desc: 'Queue ID of current played song',
                type: 'string',
                role: 'media.qid',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_elapsed', {
            type: 'state',
            common: {
                name: 'Elapsed time in seconds',
                desc: 'Elapsed time of current played song in seconds',
                type: 'number',
                role: 'media.elapsed',
                read: true,
                write: false,
                unit: 'seconds',
                def: 0
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_elapsed_s', {
            type: 'state',
            common: {
                name: 'Elapsed time as text',
                desc: 'Elapsed time of current played song as HH:MM:SS',
                type: 'string',
                role: 'media.elapsed.text',
                read: true,
                write: false,
                unit: 'interval',
                def: '00:00'
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_duration', {
            type: 'state',
            common: {
                name: 'Current song duration',
                desc: 'Duration of current played song in seconds',
                type: 'number',
                role: 'media.duration',
                read: true,
                write: false,
                unit: 'seconds',
                def: 0
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'current_duration_s', {
            type: 'state',
            common: {
                name: 'Current duration',
                desc: 'Duration of current played song as HH:MM:SS',
                type: 'string',
                role: 'media.duration.text',
                read: true,
                write: false,
                unit: 'interval',
                def: '00:00'
            },
            native: {},
        });

        //Group
        await this.setObjectNotExistsAsync(player.statePath + 'group_leader', {
            type: 'state',
            common: {
                name: 'Group Leader',
                desc: 'True, if player is group leader',
                type: 'boolean',
                role: 'media.group_leader',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'group_member', {
            type: 'state',
            common: {
                name: 'Group member',
                desc: 'True, if player is member of a group',
                type: 'boolean',
                role: 'media.group_member',
                read: true,
                write: false,
                def: false
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'group_pid', {
            type: 'state',
            common: {
                name: 'Group player IDs',
                desc: 'Player IDs of the group members',
                type: 'string',
                role: 'media.group_pid',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'group_volume', {
            type: 'state',
            common: {
                name: 'Group volume',
                desc: 'State and control of group volume',
                type: 'number',
                role: 'level.volume.group',
                read: true,
                write: true,
                def: 0
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'group_name', {
            type: 'state',
            common: {
                name: 'Group name',
                desc: 'Name of the group',
                type: 'string',
                role: 'media.group_name',
                read: true,
                write: false,
                def: ''
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'group_muted', {
            type: 'state',
            common: {
                name: 'Group mute',
                desc: 'Group is muted',
                type: 'boolean',
                role: 'media.mute.group',
                read: true,
                write: true,
                def: false
            },
            native: {},
        });

        //Buttons
        await this.setObjectNotExistsAsync(player.statePath + 'play', {
            type: 'state',
            common: {
                name: 'Play button',
                desc: 'play',
                type: 'boolean',
                role: 'button.play',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'stop', {
            type: 'state',
            common: {
                name: 'Stop button',
                desc: 'Stop',
                type: 'boolean',
                role: 'button.stop',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'pause', {
            type: 'state',
            common: {
                name: 'Pause button',
                desc: 'pause',
                type: 'boolean',
                role: 'button.pause',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'prev', {
            type: 'state',
            common: {
                name: 'Previous button',
                desc: 'prev',
                type: 'boolean',
                role: 'button.prev',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'next', {
            type: 'state',
            common: {
                name: 'Next button',
                desc: 'next',
                type: 'boolean',
                role: 'button.next',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'volume_up', {
            type: 'state',
            common: {
                name: 'Volume up',
                desc: 'Turn the volume up',
                type: 'boolean',
                role: 'button.volume.up',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'volume_down', {
            type: 'state',
            common: {
                name: 'Volume down',
                desc: 'Turn the volume down',
                type: 'boolean',
                role: 'button.volume.down',
                read: true,
                write: true
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'auto_play', {
			type: 'state',
			common: {
                name: 'Automatic Playback',
                desc: 'Starts music automatically, if true and automatic playback is activated in the configuration',
				type: 'boolean',
				role: 'media.auto_play',
				read: true,
                write: true,
                def: true
			},
			native: {},
        });
        await this.setObjectNotExistsAsync(player.statePath + 'ignore_broadcast_cmd', {
			type: 'state',
			common: {
                name: 'Ignore Broadcast commands',
                desc: 'If true, player ignores commands to all players',
				type: 'boolean',
				role: 'media.auto_play',
				read: true,
                write: true,
                def: false
			},
			native: {},
        });

        await this.setStateAsync(player.statePath + 'name', player.name, true);
        await this.setStateAsync(player.statePath + 'pid', player.pid, true);
        await this.setStateAsync(player.statePath + 'model', player.model, true);
        await this.setStateAsync(player.statePath + 'version', player.version, true);
        await this.setStateAsync(player.statePath + 'ip', player.ip, true);
        await this.setStateAsync(player.statePath + 'network', player.network, true);
        await this.setStateAsync(player.statePath + 'lineout', player.lineout, true);
        await this.setStateAsync(player.statePath + 'serial', player.serial, true);

        this.getStateAsync(player.statePath + 'auto_play', (err, state) => {
            player.auto_play = state.val;
        });
        this.getStateAsync(player.statePath + 'ignore_broadcast_cmd', (err, state) => {
            player.ignore_broadcast_cmd = state.val;
        });

        return player;
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
                        this.init();
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
            if(state.val !== true){
                await this.setStateAsync('error', true);
            }
        })
        this.getState('last_error',  async (err, state) => {
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
            for (var r = 0; r < responses.length; r++) if (responses[r].trim().length > 0) {
                try {
                    JSON.parse(responses[r]); // check ob korrektes JSON Array
                    this.parseResponse(responses[r]);
                } catch (e) {
                    this.log.debug('onData: invalid json (error: ' + e.message + '): ' + responses[r]);
                    this.unfinishedResponses += responses[r];
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
                    if(state.val !== false){
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
                                    let leadHeosPlayer = this.players[jmsg.gid];
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (var i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players[pid];
                                            if (heosPlayer) {
                                                this.setState(heosPlayer.statePath + 'group_volume', jmsg.level, true);
                                            }
                                        }
                                    }
                                }
                                if (jmsg.hasOwnProperty('mute')) {
                                    let leadHeosPlayer = this.players[jmsg.gid];
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (var i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players[pid];
                                            if (heosPlayer) {
                                                this.setState(heosPlayer.statePath + 'group_muted', (jmsg.mute == 'on' ? true : false), true);
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
                                    var source = jdata.payload[i];
                                    var baseStatePath = devicePath + '.' + source.sid;
                                    var statePath = baseStatePath + '.'

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
                                            var payload = jdata.payload[i];
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
                                            var payload = jdata.payload[i];
                                            var itemId = (i + 1);
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
                                    let leadHeosPlayer = this.players[jmsg.gid];
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (var i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players[pid];
                                            if (heosPlayer) {
                                                this.setState(heosPlayer.statePath + 'group_volume', jmsg.level, true);
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
                                    let leadHeosPlayer = this.players[jmsg.gid];
                                    if (leadHeosPlayer) {
                                        var memberPids = leadHeosPlayer.group_pid.split(',');
                                        for (var i = 0; i < memberPids.length; i++) {
                                            let pid = memberPids[i];
                                            let heosPlayer = this.players[pid];
                                            if (heosPlayer) {
                                                this.setState(heosPlayer.statePath + 'group_muted', (jmsg.state == 'on' ? true : false), true);
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
                            this.getStates("players.*.group_name", async (err, states) => {
                                for (var id in states) await this.setStateAsync(id, 'no group', true);
                            });
                            this.getStates("players.*.group_leader", async (err, states) => {
                                for (var id in states) await this.setStateAsync(id, false, true);
                            });
                            this.getStates("players.*.group_member", async (err, states) => {
                                for (var id in states) await this.setStateAsync(id, false, true);
                            });
                            this.getStates("players.*.group_pid", async (err, states) => {
                                for (var id in states) await this.setStateAsync(id, '', true);
                            });

                            for (var pid in this.players) {
                                let heosPlayer = this.players[pid];
                                heosPlayer.group_leader = false;
                                heosPlayer.group_member = false;
                                heosPlayer.group_gid = '';
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
                this.parsePlayerResponse(jdata, jmsg, cmd_group, cmd);
            }

		} catch (err) { this.log.error('parseResponse: ' + err.message + '\n ' + response); }
    }

    toFormattedTime(time) {
        let hours = Math.floor(time / 3600);
        hours = (hours) ? (hours + ':') : '';
        let min = Math.floor(time / 60) % 60;
        if (min < 10) min = '0' + min;
        let sec = time % 60;
        if (sec < 10) sec = '0' + sec;
    
        return hours + min + ':' + sec;
    }

    //#################
    // Player functions
    //#################

    /** Group Leader or no group member  */
    isPlayerLeader(pid){
        if(pid in this.players){
            let player = this.players[pid];
            return player.group_member === false || player.group_leader === true;
        }
        return false;
    }

    async cleanupPlayerNowPlaying(pid){
        if(pid in this.players){
            let player = this.players[pid];
            this.getStates(player.statePath + "current_*", async (err, states) => {
                for (var id in states) {
                    this.setState(id, "", true);
                }
            })
        }
    }

    async setPlayerLastError(pid, last_error) {
        if(pid in this.players){
            let player = this.players[pid];
            player.error = true;
            this.setStateChanged(player.statePath + 'error', true, true, (error, id, notChanged) =>{
                if(!notChanged){
                    this.playerAutoPlay(player.pid);
                }
            });
            try {
                this.log.warn(last_error);
                this.getState(player.statePath + 'last_error',  async (err, state) => {
                    let val = state.val + '';
                    let lines = val.split('\n');
                    if(lines.includes(last_error))
                        lines.splice(lines.indexOf(last_error), 1);
                    if (lines.length > 4)
                        lines.pop();
                    lines.unshift(last_error);
                    await this.setStateAsync(player.statePath + 'last_error', lines.join('\n'), true)
                });
            } catch (e) { this.log.error('setLastError: ' + e.message); }
        }
    }

    async resetPlayerError(pid, deleteLastError){
        if(pid in this.players){
            let player = this.players[pid];
            player.error = false;
            await this.setStateAsync(player.statePath + 'error', false, true);
            if(deleteLastError)
                await this.setStateAsync(player.statePath + 'last_error', '', true);
        }
    }

    /** Auswertung der empfangenen Daten
     **/
    async parsePlayerResponse(jdata, jmsg, cmd_group, cmd) {
        let pid = jmsg.pid;
        if(pid in this.players){
            let player = this.players[pid];
            try {
                switch (cmd_group) {
                    case 'event':
                        switch (cmd) {
                            case 'player_playback_error':
                                this.setPlayerLastError(pid, jmsg.error.replace(/_/g, ' '));
                                break;
                            case 'player_state_changed':
                                this.setState(player.statePath + "state", jmsg.state, true);
                                player.state = jmsg.state;
                                this.sendCommandToPlayer(pid, 'get_now_playing_media');
                                break;
                            case 'player_volume_changed':
                                this.setStateChanged(player.statePath + "volume", jmsg.level, true);
                                let newMuted = (jmsg.mute == 'on' ? true : false);
                                player.muted = newMuted;
                                this.setStateChanged(player.statePath + "muted", newMuted, true, (error, id, notChanged) =>{
                                    if(!notChanged){
                                        this.playerAutoPlay(player.pid);
                                    }
                                });
                                break;
                            case 'repeat_mode_changed':
                                this.setState(player.statePath + "repeat", jmsg.repeat, true);
                                break;
                            case 'shuffle_mode_changed':
                                this.setState(player.statePath + "shuffle", (jmsg.shuffle == 'on' ? true : false), true);
                                break;
                            case 'player_now_playing_changed':
                                this.sendCommandToPlayer(pid, 'get_now_playing_media');
                                break;
                            case 'player_now_playing_progress':
                                this.setState(player.statePath + "current_elapsed", jmsg.cur_pos / 1000, true);
                                this.setState(player.statePath + "current_elapsed_s", this.toFormattedTime(jmsg.cur_pos / 1000), true);
                                this.setState(player.statePath + "current_duration", jmsg.duration / 1000, true);
                                this.setState(player.statePath + "current_duration_s", this.toFormattedTime(jmsg.duration / 1000), true);
                                break;
                        }
                        break;


                    case 'player':
                        switch (cmd) {
                            case 'set_volume':
                            case 'get_volume':
                                this.getState(player.statePath + "volume",  async (err, state) => {
                                    if (state == null || state == undefined || state.val != jmsg.level)
                                        this.setState(player.statePath + "volume", jmsg.level, true);
                                });
                                break;
                            case 'set_mute':
                            case 'get_mute':
                                this.setState(player.statePath + "muted", (jmsg.state == 'on' ? true : false), true);
                                player.muted = (jmsg.state == 'on' ? true : false);
                                break;
                            case 'set_play_state':
                            case 'get_play_state':
                                this.setState(player.statePath + "state", jmsg.state, true);
                                player.state = jmsg.state;
                                break;
                            case 'set_play_mode':
                            case 'get_play_mode':
                                this.setState(player.statePath + "repeat", jmsg.repeat, true);
                                this.setState(player.statePath + "shuffle", (jmsg.shuffle == 'on' ? true : false), true);
                                break;
                            case 'get_now_playing_media':
                                this.resetPlayerError(pid, false);
                                if (jdata.payload.hasOwnProperty('type')) {
                                    this.setState(player.statePath + "current_type", jdata.payload.type, true);
                                    if (jdata.payload.type == 'station') {
                                        this.setState(player.statePath + "current_station", jdata.payload.station, true);
                                    } else {
                                        this.setState(player.statePath + "current_station", "", true);
                                    }
                                } else {
                                    this.setState(player.statePath + "current_type", "", true);
                                }

                                if (jdata.payload.hasOwnProperty('song'))
                                    this.setState(player.statePath + "current_title", jdata.payload.song, true);
                                else
                                    this.setState(player.statePath + "current_title", "", true);

                                if (jdata.payload.hasOwnProperty('album'))
                                    this.setState(player.statePath + "current_album", jdata.payload.album, true);
                                else
                                    this.setState(player.statePath + "current_album", "", true);

                                if (jdata.payload.hasOwnProperty('album_id'))
                                    this.setState(player.statePath + "current_album_id", jdata.payload.album_id, true);
                                else
                                    this.setState(player.statePath + "current_album_id", "", true);

                                if (jdata.payload.hasOwnProperty('artist'))
                                    this.setState(player.statePath + "current_artist", jdata.payload.artist, true);
                                else
                                    this.setState(player.statePath + "current_artist", "", true);

                                if (jdata.payload.hasOwnProperty('image_url'))
                                    this.setState(player.statePath + "current_image_url", jdata.payload.image_url, true);
                                else
                                    this.setState(player.statePath + "current_image_url", "", true);

                                if (jdata.payload.hasOwnProperty('mid')) {
                                    this.setState(player.statePath + "current_mid", jdata.payload.mid, true);
                                    this.playerMuteSpotifyAd(player.pid, jdata.payload.mid);
                                } else {
                                    this.setState(player.statePath + "current_mid", "", true);
                                }

                                if (jdata.payload.hasOwnProperty('qid'))
                                    this.setState(player.statePath + "current_qid", jdata.payload.qid, true);
                                else
                                    this.setState(player.statePath + "current_qid", "", true);

                                if (jdata.payload.hasOwnProperty('sid'))
                                    this.setState(player.statePath + "current_sid", jdata.payload.sid, true);
                                else
                                    this.setState(player.statePath + "current_sid", "", true);
                                break;
                        }
                        break;
                } // switch


            } catch (err) { this.log.error('parseResponse: ' + err.message); }
        }
    }

    playerMuteSpotifyAd(pid, mid){
        if(this.config.muteSpotifyAds === true){
            if(pid in this.players){
                let player = this.players[pid];
                this.log.debug("autoMute player: " + JSON.stringify(player));
                if(mid.startsWith("spotify:ad:") && player.muted === false){
                    player.muted_ad = true;
                    this.sendCommandToPlayer(player.pid, 'set_mute&state=on');
                } else if(!mid.startsWith("spotify:ad:") && player.muted_ad === true){
                    player.muted_ad = false;
                    this.sendCommandToPlayer(player.pid, 'set_mute&state=off');
                }        
            }
        }
    }

    playerAutoPlay(pid){
        if(this.config.autoPlay === true){
            if(pid in this.players){
                let player = this.players[pid];
                this.log.debug("autoPlay player: " + JSON.stringify(player));
                if(player.auto_play === true && player.connected === true && player.muted === false){
                    this.log.info('start playing music at ' + player.name);
                    if(player.error === true){
                        this.sendCommandToPlayer(player.pid, this.config.autoPlayCmd);
                    } else {
                        this.sendCommandToPlayer(player.pid, 'set_play_state&state=play');
                    }
                }
            }
        }
    }

    /** cmd der Form "cmd&param"  werden zur msg heos+cmd+pid+&param aufbereitet
        cmd der Form "cmd?param"  werden zur msg heos+cmd+?param aufbereitet
     **/
    playerCommandToMsg(pid, cmd) {
        var param = cmd.split('&');
        cmd = param.shift();
        if (param.length > 0) param = '&' + param.join('&'); else param = '';
        var cmd_group = 'player';

        switch (cmd) {
            case 'get_play_state':
            case 'get_play_mode':
            case 'get_now_playing_media':
            case 'get_volume':
            case 'play_next':
            case 'play_previous':
            case 'set_mute':       // &state=on|off        
            case 'set_volume':     // &level=1..100   
            case 'volume_down':    // &step=1..10   
            case 'volume_up':      // &step=1..10
            case 'set_play_state': // &state=play|pause|stop
            case 'set_play_mode':  // &repeat=on_all|on_one|off  shuffle=on|off
                break;

            // browse            
            case 'play_preset':    // heos://browse/play_preset?pid=player_id&preset=preset_position
                cmd_group = 'browse';
                break;
            case 'play_stream':    // heos://browse/play_stream?pid=player_id&url=url_path
                cmd_group = 'browse';
                break;

        }
        return 'heos://' + cmd_group + '/' + cmd + '?pid=' + pid + param;
    }

    /** Nachricht (command) an player senden
        es sind auch mehrere commands, getrennt mit | erlaubt
        bsp: set_volume&level=20|play_preset&preset=1
     **/
    sendCommandToPlayer(pid, cmd) {
        if(pid in this.players){
            var cmds = cmd.split('|');
            for (var c = 0; c < cmds.length; c++) {
                this.msgs.push(this.playerCommandToMsg(pid, cmds[c]));
            }
            this.sendNextMsg();
        }
    }

    sendCommandToAllPlayers(cmd, leaderOnly){
        if (this.state == States.Connected) {
            for (var pid in this.players) {
                let player = this.players[pid];

                if((player.ignore_broadcast_cmd === false && !leaderOnly) || (leaderOnly && this.isPlayerLeader(pid))){
                    this.sendCommandToPlayer(pid, cmd);
                }
            }
        }
    }

    async startPlayer(pid){
        if(pid in this.players){
            this.log.info('start player ' + pid);
            let player = this.players[pid];

            this.sendCommandToPlayer(player.pid, 'get_play_state|get_play_mode|get_now_playing_media|get_volume');

            setTimeout(() => {
                this.setState(player.statePath + 'connected', true);
                player.connected = true;
                this.playerAutoPlay(player.pid);
            }, 1000);
        }
    }

    async stopPlayer(pid){
        if(pid in this.players){
            let player = this.players[pid];
            this.log.info('stopping HEOS player with pid ' + player.pid + ' (' + player.ip + ')');
            //cleanup now playing
            this.cleanupPlayerNowPlaying(pid);
            // reset error
            this.resetPlayerError(pid, true);
            // connected zurücksetzen
            await this.setStateAsync(player.statePath + "connected", false, true);
            // player leeren
            delete this.players[pid];
        }
    }

    // Für die gefundenen HEOS Player entsprechende class HeosPlayer Instanzen bilden und nicht mehr verbundene Player stoppen
    async startPlayers(payload) {
        try {
            var connectedPlayers = [];
            for (var i = 0; i < payload.length; i++) {
                var player = payload[i];
                var pid = player.pid + ''; //Convert to String
                if(!(pid in this.players)){
                    this.players[pid] = await this.createPlayer(player);
                    await this.startPlayer(pid);
                }
                connectedPlayers.push(pid);
            }
            //Remove disconnected players
            for(var pid in this.players) {
                if(!connectedPlayers.includes(pid)){
                    this.stopPlayer(pid);
                }
            }
            this.getGroups();
        } catch (err) { this.log.error('startPlayers: ' + err.message); }
    }

    //Alle Player stoppen
    stopPlayers() {
        this.log.debug("try to stop players:" + JSON.stringify(Object.keys(this.players)));
        for (var pid in this.players) {
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
                if(pid in this.players){
                    let player = this.players[pid];
                    player.group_pid = group.pid;
                    player.group_leader = (i == 0) && (pids.length > 1);
                    player.group_member = (pids.length > 1);
                    this.setState(player.statePath + 'group_name', (group.hasOwnProperty('name') ? group.name : ''), true);
                    this.setState(player.statePath + 'group_pid', player.group_pid, true);
                    this.setState(player.statePath + 'group_leader', player.group_leader, true);
                    this.setState(player.statePath + 'group_member', player.group_member, true);
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
            for (var pid in this.players) {
                let player = this.players[pid];
                if(player.group_leader === true){
                    this.msgs.push('heos://group/set_group?pid=' + pid);
                    this.sendNextMsg();
                }
            }
        }
    }

    groupAll() {
        if (this.state == States.Connected) {
            let pids = Object.keys(this.players).join(',');
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
        try {
            this.net_client.write(msg + "\n");
        } catch (err) { 
            this.log.error('sendMsg: ' + err.message);
            this.reconnect();
        }
        this.log.debug("data sent: " + msg);
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
        }
        if (typeof this.nodessdp_client !== 'undefined') {
            this.nodessdp_client.stop();
        }
        this.setState("error", false);
        this.setState("last_error", "");
        this.setState("connected", false);
        this.setState('signed_in', false);
        this.setState('signed_in_user', "");
        this.state = States.Disconnected;
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
            this.init();
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
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Heos(options);
} else {
	// otherwise start the instance directly
	new Heos();
}