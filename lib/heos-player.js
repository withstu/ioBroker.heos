/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2021 withstu <withstu@gmx.de>
 * MIT License
 *
 * derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula
 */
'use strict';

const HeosUPnP = require('./heos-upnp');

class HeosPlayer {
	/**
	 * @param {import('../main')} heos Heos Adapter
	 * @param {object} player Json Object from HEOS
	 */
	constructor(heos, player){
		this.heos = heos;
		
		this.baseStatePath = 'players.' + player.pid;
		this.statePath = this.baseStatePath + '.';
		this.group_member = false;
		this.group_leader = false;
		this.group_leader_pid = '';
		this.group_pid = '';
		this.group_name = '';
		this.group_volume = 0;
		this.group_muted = false;
		this.state = 'stop';
		this.state_simple = false;
		this.muted = false;
		this.connected = false;
		this.muted_regex = false;
		this.error = false;
		this.current_type = '';
		this.current_duration = 0;
		this.storedState = {};
		this.tts_playing = false;
		this.tts_queue = [];
		this.tts_started = null;
		this.volume_max = 100;
		this.ignore_broadcast_cmd = true;
		this.auto_play = false;
		this.allowed_actions = [];

		//Timeouts
		this.connect_timeout = undefined;
		this.tts_timeout = undefined;
		this.tts_stop_timeout = undefined;
		this.tts_stop_restore_timeout = undefined;
		this.restore_timeout = undefined;
		this.respond_timeout = undefined;

		this.initMetaData(player);
	}

	async initMetaData(player){
		this.pid = player.pid;
		this.ip = player.ip;
		this.name = player.name;
		this.model = player.model;
		this.serial = player.serial;
		this.version = player.version;
		this.network = player.network;
		this.lineout = player.lineout;

		//Init Upnp
		this.upnp = new HeosUPnP(player.ip);
		
		//Channel
		await this.heos.setObjectAsync(this.baseStatePath, {
			type: 'channel',
			common: {
				name: this.name || this.ip,
				role: 'media.music'
			},
			native: {},
		});

		//Meta
		await this.heos.setObjectAsync(this.statePath + 'connected', {
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
		await this.heos.setObjectAsync(this.statePath + 'command', {
			type: 'state',
			common: {
				name: 'Player command',
				desc: 'Send command to player',
				type: 'string',
				role: 'text',
				read: true,
				write: true,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'ip', {
			type: 'state',
			common: {
				name: 'Player IP-Address',
				desc: 'IP Address of the player',
				type: 'string',
				role: 'info.ip',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'settings_url', {
			type: 'state',
			common: {
				name: 'Settings URL',
				desc: 'Settings page of the player',
				type: 'string',
				role: 'text.url',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'pid', {
			type: 'state',
			common: {
				name: 'Player ID',
				desc: 'Unique ID of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'name', {
			type: 'state',
			common: {
				name: 'Player name',
				desc: 'Name of the player',
				type: 'string',
				role: 'info.name',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'model', {
			type: 'state',
			common: {
				name: 'Player model',
				desc: 'Model of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'serial', {
			type: 'state',
			common: {
				name: 'Player serial number',
				desc: 'Serial number of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'network', {
			type: 'state',
			common: {
				name: 'Network connection type',
				desc: 'wired, wifi or unknown',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'lineout', {
			type: 'state',
			common: {
				name: 'LineOut level type',
				desc: 'variable or fixed',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'error', {
			type: 'state',
			common: {
				name: 'Player error status',
				desc: 'True, if player has an error',
				type: 'boolean',
				role: 'indicator.maintenance',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'last_error', {
			type: 'state',
			common: {
				name: 'Last player error messages',
				desc: 'Last 4 player error messages',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ""
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'volume', {
			type: 'state',
			common: {
				name: 'Player volume',
				desc: 'State and control of volume',
				type: 'number',
				role: 'level.volume',
				read: true,
				write: true,
				min: 0,
				max: 100,
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'volume_max', {
			type: 'state',
			common: {
				name: 'Maximum player volume',
				desc: 'State and control of max volume',
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				min: 0,
				max: 100,
				def: 100
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'muted', {
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
		await this.heos.setObjectAsync(this.statePath + 'state', {
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
		await this.heos.setObjectAsync(this.statePath + 'state_simple', {
			type: 'state',
			common: {
				name: 'Binary play/pause state',
				desc: 'Play or pause',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'repeat', {
			type: 'state',
			common: {
				name: 'Repeat',
				desc: 'Repeat mode',
				type: 'string',
				role: 'text',
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
		await this.heos.setObjectAsync(this.statePath + 'shuffle', {
			type: 'state',
			common: {
				name: 'Shuffle',
				desc: 'Shuffle mode',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'seek', {
			type: 'state',
			common: {
				name: 'Seek position',
				desc: 'Seek position in percent',
				type: 'number',
				role: 'media.seek',
				read: true,
				write: true,
				min: 0,
				max: 100,
				unit: '%'
			},
			native: {},
		});

		//Now playing
		await this.heos.setObjectAsync(this.statePath + 'current_type', {
			type: 'state',
			common: {
				name: 'Media Type',
				desc: 'Type of the media',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_title', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_station', {
			type: 'state',
			common: {
				name: 'Current station',
				desc: 'Title of current played station',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_album_id', {
			type: 'state',
			common: {
				name: 'Current album ID',
				desc: 'Album ID of current played song',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_album', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_artist', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_image_url', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_mid', {
			type: 'state',
			common: {
				name: 'Current media ID',
				desc: 'Media ID of current played song',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_sid', {
			type: 'state',
			common: {
				name: 'Current source ID',
				desc: 'Source ID of current played song',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_source_name', {
			type: 'state',
			common: {
				name: 'Current source name',
				desc: 'Source of current played song',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_source_image_url', {
			type: 'state',
			common: {
				name: 'Current source image URL',
				desc: 'Source image of current played song',
				type: 'string',
				role: 'text.url',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_qid', {
			type: 'state',
			common: {
				name: 'Current queue ID',
				desc: 'Queue ID of current played song',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_elapsed', {
			type: 'state',
			common: {
				name: 'Elapsed time in seconds',
				desc: 'Elapsed time of current played song in seconds',
				type: 'number',
				role: 'media.elapsed',
				read: true,
				write: true,
				unit: 'seconds',
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_elapsed_s', {
			type: 'state',
			common: {
				name: 'Elapsed time as text',
				desc: 'Elapsed time of current played song as HH:MM:SS',
				type: 'string',
				role: 'media.elapsed.text',
				read: true,
				write: true,
				unit: 'interval',
				def: '00:00'
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_duration', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_duration_s', {
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
		await this.heos.setObjectAsync(this.statePath + 'current_bitrate', {
			type: 'state',
			common: {
				name: 'Current song bitrate',
				desc: 'Bitrate of current played song',
				type: 'number',
				role: 'media.bitrate',
				read: true,
				write: false,
				unit: 'kbps',
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_sample_rate', {
			type: 'state',
			common: {
				name: 'Current song sample rate',
				desc: 'Sample rate of current played song',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'kHz',
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_audio_format', {
			type: 'state',
			common: {
				name: 'Current song audio format',
				desc: 'Audio format of current played song',
				type: 'string',
				role: 'media.content',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'current_allowed_actions', {
			type: 'state',
			common: {
				name: 'Current source allowed actions',
				desc: 'Allowed actions of current played source',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'queue', {
			type: 'state',
			common: {
				name: 'Queue',
				desc: 'List of the queued items',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
				def: "[]"
			},
			native: {},
		});

		//Group
		await this.heos.setObjectAsync(this.statePath + 'group_leader', {
			type: 'state',
			common: {
				name: 'Group Leader',
				desc: 'True, if player is group leader',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'group_leader_pid', {
			type: 'state',
			common: {
				name: 'Group leader ID',
				desc: 'Player ID of the group leader',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'group_member', {
			type: 'state',
			common: {
				name: 'Group member',
				desc: 'True, if player is member of a group',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'group_pid', {
			type: 'state',
			common: {
				name: 'Group player IDs',
				desc: 'Player IDs of the group members',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'group_volume', {
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
		await this.heos.setObjectAsync(this.statePath + 'group_name', {
			type: 'state',
			common: {
				name: 'Group name',
				desc: 'Name of the group',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'group_muted', {
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
		await this.heos.setObjectAsync(this.statePath + 'tts', {
			type: 'state',
			common: {
				name: 'Text to speech',
				desc: 'Set text2speech mp3 file to play',
				type: 'string',
				role: 'media.tts',
				read: true,
				write: true
			},
			native: {},
		});

		//Buttons
		await this.heos.setObjectAsync(this.statePath + 'play', {
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
		await this.heos.setObjectAsync(this.statePath + 'stop', {
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
		await this.heos.setObjectAsync(this.statePath + 'pause', {
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
		await this.heos.setObjectAsync(this.statePath + 'prev', {
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
		await this.heos.setObjectAsync(this.statePath + 'next', {
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
		await this.heos.setObjectAsync(this.statePath + 'volume_up', {
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
		await this.heos.setObjectAsync(this.statePath + 'volume_down', {
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
		await this.heos.setObjectAsync(this.statePath + 'clear_queue', {
			type: 'state',
			common: {
				name: 'Clear queue',
				desc: 'Remove all items from queue',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true
			},
			native: {},
		});

		//Configuration
		await this.heos.setObjectAsync(this.statePath + 'auto_play', {
			type: 'state',
			common: {
				name: 'Automatic Playback',
				desc: 'Starts music automatically, if true and automatic playback is activated in the configuration',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: true
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.statePath + 'ignore_broadcast_cmd', {
			type: 'state',
			common: {
				name: 'Ignore Broadcast commands',
				desc: 'If true, player ignores commands to all players',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});

		await this.heos.setStateAsync(this.statePath + 'name', this.name, true);
		await this.heos.setStateAsync(this.statePath + 'pid', this.pid, true);
		await this.heos.setStateAsync(this.statePath + 'model', this.model, true);
		await this.heos.setStateAsync(this.statePath + 'version', this.version, true);
		await this.heos.setStateAsync(this.statePath + 'ip', this.ip, true);
		await this.heos.setStateAsync(this.statePath + 'settings_url', "http://" + this.ip + "/settings/index.html", true)
		await this.heos.setStateAsync(this.statePath + 'network', this.network, true);
		await this.heos.setStateAsync(this.statePath + 'lineout', this.lineout, true);
		await this.heos.setStateAsync(this.statePath + 'serial', this.serial, true);

		this.heos.getStateAsync(this.statePath + 'auto_play', (err, state) => {
			this.auto_play = state.val;
		});
		this.heos.getStateAsync(this.statePath + 'ignore_broadcast_cmd', (err, state) => {
			this.ignore_broadcast_cmd = state.val;
		});
		this.heos.getStateAsync(this.statePath + 'volume_max', (err, state) => {
			this.volume_max = state.val;
		});
	}

	async resetTimeouts(){
		if (this.tts_timeout) {
			clearTimeout(this.tts_timeout);
			this.tts_timeout = undefined;
		}
		if (this.tts_stop_timeout) {
			clearTimeout(this.tts_stop_timeout);
			this.tts_stop_timeout = undefined;
		}
		if (this.tts_stop_restore_timeout) {
			clearTimeout(this.tts_stop_restore_timeout);
			this.tts_stop_restore_timeout = undefined;
		}
		if (this.connect_timeout) {
			clearTimeout(this.connect_timeout);
			this.connect_timeout = undefined;
		}
		if (this.restore_timeout) {
			clearTimeout(this.restore_timeout);
			this.restore_timeout = undefined;
		}
		if (this.respond_timeout) {
			clearTimeout(this.respond_timeout);
			this.respond_timeout = undefined;
		}
	}

	async connect(){
		this.heos.log.info('connect HEOS player ' + this.name + ' (' + this.pid + ')');
		await this.upnp.init()
		
		this.sendCommand('get_play_state|get_play_mode|get_now_playing_media|get_volume');

		this.connect_timeout = setTimeout(async () => {
			await this.heos.setStateAsync(this.statePath + 'connected', true);
			this.connected = true;
			this.autoPlay();
		}, 5000);
	}

	async disconnect(){
		this.heos.log.info('disconnect HEOS player ' + this.name + ' (' + this.pid + ')');
		//cleanup now playing
		this.cleanupNowPlaying();
		// reset error
		this.resetError(true);
		// reset timeouts
		await this.resetTimeouts();

		// connected zurücksetzen
		await this.heos.setStateAsync(this.statePath + "connected", false, true);
	}

	/** Group Leader or no group member  */
	isPlayerLeader(){
		return this.group_member === false || this.group_leader === true;
	}

	/**
	 * 
	 * @param {String} payload
	 */
	muteRegex(payload){
		if(this.heos.config.muteOnRegex === true){
			const regex = RegExp(this.heos.config.muteRegex, 'gi');
			this.heos.log.debug("Test regex '" + regex + "' on " + payload + " with result: " + regex.test(payload));
			if(regex.test(payload) && this.muted === false){
				this.muted_regex = true;
				this.sendCommand('set_mute&state=on');
				this.heos.log.info("Mute " + this.name + ", because regex matches");
			} else if(!regex.test(payload) && this.muted_regex === true){
				this.muted_regex = false;
				this.sendCommand('set_mute&state=off');
				this.heos.log.info("Unmute " + this.name + ", because regex is not matching any more");
			}
		}
	}

	stringifyReplacer(key,value)
	{
		if (key=="heos" || key.indexOf("timeout") > -1) return undefined;
		else return value;
	}

	autoPlay(){
		if(this.heos.config.autoPlay === true){
			if(this.auto_play === true) {
				if(this.connected === true
					&& this.muted === false){
					if(this.error === true || this.current_type.length == 0){
						this.heos.log.info('auto play default music at ' + this.name);
						this.sendCommand(this.heos.config.autoPlayCmd);
					} else if(this.state_simple === false){
						this.heos.log.info('auto play music at ' + this.name);
						this.sendCommand('set_play_state&state=play');
					} else {
						this.heos.log.debug('AutoPlay not started. Already playing. State:' + JSON.stringify(this, this.stringifyReplacer));
					}
				} else {
					this.heos.log.debug('AutoPlay not started on player ' + this.name + '. Player is not connected or muted.');
				}
			} else {
				this.heos.log.debug('AutoPlay is disabled on player ' + this.name);
			}
		} else {
			this.heos.log.debug('AutoPlay is disabled in configuration');
		}
	}

	//Detect not responding player
	detectHeosFailure(){
		if (this.respond_timeout) {
			clearTimeout(this.respond_timeout);
			this.respond_timeout = undefined;
		}
		if(this.state_simple) {
			this.respond_timeout = setTimeout(() => {
				this.heos.log.warn("HEOS is not responding as expected. Reboot.")
				this.heos.reboot();
			}, 30000);
		}
	}

	/**
	 * 
	 * @param {String} name 
	 */
	async setGroupName(name){
		this.group_name = name;
		await this.heos.setStateAsync(this.statePath + 'group_name', this.group_name, true);
	}

	/**
	 * 
	 * @param {String} pid
	 */
	async setGroupPid(pid){
		this.group_pid = pid;
		await this.heos.setStateAsync(this.statePath + 'group_pid', this.group_pid, true);
	}

	/**
	 * 
	 * @param {boolean} leader 
	 */
	async setGroupLeader(leader){
		this.group_leader = leader;
		await this.heos.setStateAsync(this.statePath + 'group_leader', this.group_leader, true);
	}

	/**
	 * 
	 * @param {String} pid
	 */
	async setGroupLeaderPid(pid){
		this.group_leader_pid = pid;
		await this.heos.setStateAsync(this.statePath + 'group_leader_pid', this.group_leader_pid, true);
	}

	/**
	 * 
	 * @param {boolean} member 
	 */
	async setGroupMember(member){
		this.group_member = member;
		await this.heos.setStateAsync(this.statePath + 'group_member', this.group_member, true);
	}

	/**
	 * 
	 * @param {number} volume 
	 */
	async setGroupVolume(volume){
		this.group_volume = volume;
		await this.heos.setStateAsync(this.statePath + 'group_volume', this.group_volume, true);
	}

	/**
	 * 
	 * @param {boolean} muted 
	 */
	async setGroupMuted(muted){
		this.group_muted = muted;
		await this.heos.setStateAsync(this.statePath + 'group_muted', this.group_muted, true);
	}

	async cleanupNowPlaying(){
		this.heos.getStates(this.statePath + "current_*", async (err, states) => {
			for (var id in states) {
				this.heos.setState(id, "", true);
			}
		})
	}

	/**
	 * 
	 * @param {String} last_error 
	 */
	async setError(last_error) {
		this.error = true;
		this.heos.setStateChanged(this.statePath + 'error', true, true, (error, id, notChanged) =>{
			if(!notChanged){
				this.autoPlay();
			};
		});
		try {
			this.heos.log.warn(last_error);
			this.heos.getState(this.statePath + 'last_error',  async (err, state) => {
				if(state) {
					let val = state.val + '';
					let lines = val.split('\n');
					if(lines.includes(last_error))
						lines.splice(lines.indexOf(last_error), 1);
					if (lines.length > 4)
						lines.pop();
					lines.unshift(last_error);
					await this.heos.setStateAsync(this.statePath + 'last_error', lines.join('\n'), true)
				}
			});
		} catch (e) { this.heos.log.error('setLastError: ' + e.message); }
	}

	/**
	 * 
	 * @param {boolean} deleteLastError 
	 */
	async resetError(deleteLastError){
		this.error = false;
		await this.heos.setStateAsync(this.statePath + 'error', false, true);
		if(deleteLastError)
			await this.heos.setStateAsync(this.statePath + 'last_error', '', true);
	}

	async updateUpnp(){
		await this.updateUpnpSongMeta();
		await this.updateUpnpAllowedActions()
	}

	async updateUpnpSongMeta(){
		let service = 'AVTransport'
		let action = 'GetPositionInfo'
		let data = {
			InstanceID: 0
		}
		try{
			let upnp = this.upnp;
			if(!this.isPlayerLeader()){
				let leader = this.heos.players[this.group_leader_pid];
				if(leader){
					upnp = leader.upnp;
				}
			}
			var result = await upnp.sendCommand(service, action, data)
			let bitrate = '@_bitrate' in result.TrackMetaData.res ? Math.trunc(result.TrackMetaData.res['@_bitrate'] / 1000) : 0;
			let sample_rate = '@_sampleFrequency' in result.TrackMetaData.res ? result.TrackMetaData.res['@_sampleFrequency'] / 1000 : 0;

			this.heos.setState(this.statePath + "current_bitrate", bitrate, true);
			this.heos.setState(this.statePath + "current_sample_rate", sample_rate, true);

			let format = ''
			if(result.TrackMetaData.desc && Array.isArray(result.TrackMetaData.desc)){
				for(const desc of result.TrackMetaData.desc){
					if(desc['@_id'] == 'audioFormat'){
						format = desc.value
					}
				}
			}
			this.heos.setState(this.statePath + "current_audio_format", format, true);
		} catch(err){
			this.heos.log.warn('update upnp meta failed: ' + err)
		}
	}

	async updateUpnpAllowedActions(){
		let service = 'AVTransport'
		let action = 'GetCurrentTransportActions'
		let data = {
			InstanceID: 0
		}
		try{
			var result = await this.upnp.sendCommand(service, action, data)
			this.allowed_actions = result.Actions.split(',')
			this.heos.setState(this.statePath + "current_allowed_actions", result.Actions, true);
		} catch(err){
			this.heos.log.warn('update upnp allowed actions failed: ' + err)
		}
	}

	/**
	 * Auswertgung der empfangenen Daten
	 * @param {*} jdata 
	 * @param {*} jmsg 
	 * @param {String} cmd_group 
	 * @param {String} cmd 
	 */
	async parseResponse(jdata, jmsg, cmd_group, cmd) {
		let pid = jmsg.pid;
		try {
			switch (cmd_group) {
				case 'event':
					switch (cmd) {
						case 'player_playback_error':
							this.setError(jmsg.error.replace(/_/g, ' '));
							this.sendCommand('get_play_state');
							break;
						case 'player_state_changed':
							this.state = jmsg.state;
							this.state_simple = this.state == "play" ? true : false;
							this.heos.setState(this.statePath + "state", this.state, true);
							this.heos.setState(this.statePath + "state_simple", this.state_simple, true);
							if(this.tts_playing){
								this.stopTTS();
							}
							this.sendCommand('get_now_playing_media');

							this.detectHeosFailure();
							break;
						case 'player_volume_changed':
							let volume = jmsg.level
							if(this.volume_max < jmsg.level){
								volume = this.volume_max;
								this.heos.log.info(this.name + ": Max volume reached. Reset to: " + volume);
								this.sendCommand('set_volume&level=' + volume);
							}
							this.heos.setStateChanged(this.statePath + "volume", volume, true);
							let newMuted = (jmsg.mute == 'on' ? true : false);
							this.muted = newMuted;
							this.heos.setStateChanged(this.statePath + "muted", newMuted, true, (error, id, notChanged) =>{
								if(!notChanged){
									this.autoPlay();
								}
							});
							break;
						case 'repeat_mode_changed':
							this.heos.setState(this.statePath + "repeat", jmsg.repeat, true);
							break;
						case 'shuffle_mode_changed':
							this.heos.setState(this.statePath + "shuffle", (jmsg.shuffle == 'on' ? true : false), true);
							break;
						case 'player_now_playing_changed':
							this.sendCommand('get_now_playing_media');

							this.detectHeosFailure();
							break;
						case 'player_now_playing_progress':
							if(this.error){
								this.resetError(false);
							}
							this.current_duration = jmsg.duration / 1000;
							this.heos.setState(this.statePath + "current_elapsed", jmsg.cur_pos / 1000, true);
							this.heos.setState(this.statePath + "current_elapsed_s", this.toFormattedTime(jmsg.cur_pos / 1000, true), true);
							this.heos.setState(this.statePath + "current_duration", this.current_duration, true);
							this.heos.setState(this.statePath + "current_duration_s", this.toFormattedTime(this.current_duration, true), true);

							this.detectHeosFailure();
							break;
						case 'player_queue_changed':
							//if(!this.tts_playing){
							//this.sendCommand('get_queue');
							//}
							break;
					}
					break;


				case 'player':
					switch (cmd) {
						case 'set_volume':
						case 'get_volume':
							this.heos.getState(this.statePath + "volume",  async (err, state) => {
								if (state == null || state == undefined || state.val != jmsg.level){
									let volume = jmsg.level;
									if(this.volume_max < jmsg.level){
										volume = this.volume_max;
										this.heos.log.info(this.name + ": Max volume reached. Reset to: " + volume);
										this.sendCommand('set_volume&level=' + volume);
									}
									this.heos.setState(this.statePath + "volume", volume, true);
								}
							});
							break;
						case 'set_mute':
						case 'get_mute':
							this.heos.setState(this.statePath + "muted", (jmsg.state == 'on' ? true : false), true);
							this.muted = (jmsg.state == 'on' ? true : false);
							break;
						case 'set_play_state':
						case 'get_play_state':
							if(jmsg.state != "unknown"){
								this.state = jmsg.state;
								this.state_simple = this.state == "play" ? true : false;
								this.heos.setState(this.statePath + "state", this.state, true);
								this.heos.setState(this.statePath + "state_simple", this.state_simple, true);
								
								this.detectHeosFailure();
							}
							break;
						case 'set_play_mode':
						case 'get_play_mode':
							this.heos.setState(this.statePath + "repeat", jmsg.repeat, true);
							this.heos.setState(this.statePath + "shuffle", (jmsg.shuffle == 'on' ? true : false), true);
							break;
						case 'get_now_playing_media':
							//Filter invalid responses
							if(jdata.payload.hasOwnProperty('sid') && jdata.payload.sid != 0){
								this.muteRegex(JSON.stringify(jdata.payload));

								if (jdata.payload.hasOwnProperty('sid')) {
									this.heos.setState(this.statePath + "current_sid", jdata.payload.sid, true);
									let source = this.heos.mapSource(jdata.payload.sid);
									if(source){
										this.heos.setState(this.statePath + "current_source_name", source.name, true);
										this.heos.setState(this.statePath + "current_source_image_url", source.image_url, true);
									} else {
										this.heos.getState('sources.' + jdata.payload.sid + '.name',  async (err, state) => {
											if(state && state.val && !state.notExist){
												this.heos.setState(this.statePath + "current_source_name", state.val + '', true);
											} else {
												this.heos.setState(this.statePath + "current_source_name", "", true);
											}
										});
										this.heos.getState('sources.' + jdata.payload.sid + '.image_url',  async (err, state) => {
											if(state && state.val && !state.notExist){
												this.heos.setState(this.statePath + "current_source_image_url", state.val + '', true);
											} else {
												this.heos.setState(this.statePath + "current_source_image_url", "", true);
											}
										});
									}
								} else {
									this.heos.setState(this.statePath + "current_sid", "", true);
									this.heos.setState(this.statePath + "current_source_name", "", true);
									this.heos.setState(this.statePath + "current_source_image_url", "", true);
								}

								if (jdata.payload.hasOwnProperty('type')) {
									this.heos.setState(this.statePath + "current_type", jdata.payload.type, true);
									this.current_type = jdata.payload.type;
									if (jdata.payload.type == 'station') {
										this.heos.setState(this.statePath + "current_station", jdata.payload.station, true);
									} else {
										this.heos.setState(this.statePath + "current_station", "", true);
									}
								} else {
									this.heos.setState(this.statePath + "current_type", "", true);
									this.current_type = "";
								}

								if (jdata.payload.hasOwnProperty('song')) {
									this.heos.setState(this.statePath + "current_title", jdata.payload.song, true);
								} else {
									this.heos.setState(this.statePath + "current_title", "", true);
								}

								if (jdata.payload.hasOwnProperty('album')) {
									this.heos.setState(this.statePath + "current_album", jdata.payload.album, true);
								} else {
									this.heos.setState(this.statePath + "current_album", "", true);
								}

								if (jdata.payload.hasOwnProperty('album_id')) {
									this.heos.setState(this.statePath + "current_album_id", jdata.payload.album_id, true);
								} else {
									this.heos.setState(this.statePath + "current_album_id", "", true);
								}

								if (jdata.payload.hasOwnProperty('artist')) {
									this.heos.setState(this.statePath + "current_artist", jdata.payload.artist, true);
								} else {
									this.heos.setState(this.statePath + "current_artist", "", true);
								}

								if (jdata.payload.hasOwnProperty('image_url')) {
									this.heos.setState(this.statePath + "current_image_url", jdata.payload.image_url, true);
								} else {
									this.heos.setState(this.statePath + "current_image_url", "", true);
								}

								if (jdata.payload.hasOwnProperty('mid')) {
									this.heos.setState(this.statePath + "current_mid", jdata.payload.mid, true);
								} else {
									this.heos.setState(this.statePath + "current_mid", "", true);
								}

								if (jdata.payload.hasOwnProperty('qid')) {
									this.heos.setStateChanged(this.statePath + "current_qid", jdata.payload.qid, true, (error, id, notChanged) =>{
										if(!notChanged){
											let qid;
											if(jdata.payload.qid){
												qid = jdata.payload.qid - 1;
												if(qid < 0){
													qid = 0;
												}
												if(!this.tts_playing){
													this.sendCommand('get_queue&range=' + qid + "," + (qid + 50));
												}
												if(this.tts_playing
													&& jdata.payload.hasOwnProperty('song')
													&& jdata.payload.song == "Url Stream"
													&& !this.tts_queue.includes(qid)){
														this.tts_queue.push(qid);
												} else if(this.tts_playing
													&& jdata.payload.hasOwnProperty('song')
													&& jdata.payload.song != "Url Stream"){
														this.stopTTS();
												}
											} else {
												if(!this.tts_playing){
													this.sendCommand('get_queue');
												}
											}
										}
									});
								} else {
									this.heos.setStateChanged(this.statePath + "current_qid", "", true, (error, id, notChanged) =>{
										if(!notChanged && !this.tts_playing){
											this.sendCommand('get_queue');
										}
									});
								}

								//Update Upnp
								await this.updateUpnp()
							} else {
								this.heos.log.debug("get_now_playing_media response ignored. Invalid sid.")
							}
							break;
						case 'get_queue':
							let queue = {};
							for(let key in jdata.payload){
								let payload = jdata.payload[key];
								queue[payload.qid] = payload;
							}
							this.heos.setState(this.statePath + "queue", JSON.stringify(queue), true);
							break;
					}
					break;
			} // switch


		} catch (err) { this.heos.log.error('parseResponse: ' + err.message); }
	}

	/**
	 * cmd der Form "cmd&param"  werden zur msg heos+cmd+pid+&param aufbereitet
	 * cmd der Form "cmd?param"  werden zur msg heos+cmd+?param aufbereitet
	 * @param {String} cmd 
	 */
	commandToMsg(cmd) {
		var addPid = true;
		if(cmd.includes('?')){
			addPid = false;
		}
		var s_param = '';
		var param = cmd.split('&');
		cmd = param.shift() + '';
		if (param.length > 0) s_param = param.join('&'); else s_param = '';
		var cmd_group = 'player';

		switch (cmd) {
			case 'set_group_mute':
				cmd = "set_mute";
				if(this.group_member === true){
					cmd_group = 'group'
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'set_group_volume':
				cmd = "set_volume";
				if(this.group_member === true){
					cmd_group = 'group'
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'group_volume_up':
				cmd = "volume_up";
				if(this.group_member === true){
					cmd_group = 'group'
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'group_volume_down':
				cmd = "volume_down";
				if(this.group_member === true){
					cmd_group = 'group'
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
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
			case 'play_stream':    // heos://browse/play_stream?pid=player_id&url=url_path
			case 'play_input':     // heos://browse/play_input?pid=destination_player_id&spid=source_player_id&input=input_name
			case 'add_to_queue':   // heos://browse/add_to_queue?pid=player_id&sid=source_id&cid=container_id&aid=add_criteria
				cmd_group = 'browse';
				break;
		}
		if(addPid){
			return 'heos://' + cmd_group + '/' + cmd + '?pid=' + this.pid + (s_param.length > 0 ? '&' + s_param : '');
		} else {
			return 'heos://' + cmd_group + '/' + cmd + '?' + s_param;
		}
	}

	/**
	 * Nachricht (command) an player senden 
	 * es sind auch mehrere commands, getrennt mit | erlaubt
	 * bsp: set_volume&level=20|play_preset&preset=1
	 * @param {String} cmd 
	 */
	sendCommand(cmd) {
		var cmds = cmd.split('|');
		for (var c = 0; c < cmds.length; c++) {
			this.heos.msgs.push(this.commandToMsg(cmds[c]));
		}
		this.heos.sendNextMsg();
	}

	async timeSeek(seconds){
		if(!this.allowed_actions.includes('Seek')){
			this.heos.log.warn('seek is currently not available')
		} else {
			let target = this.toFormattedTime(seconds, false);

			let service = 'AVTransport'
			let action = 'Seek'
			let data = {
				InstanceID: 0,
				Unit: 'REL_TIME',
				Target: target
			}
			try{
				let result = await this.upnp.sendCommand(service, action, data)
			} catch(err){
				this.heos.log.warn('seek failed:' + err)
			}
		}
	}

	storeState(){
        this.storedState = {};

		this.heos.getStates(this.statePath + "*", async (err, states) => {
			for (var id in states) {
				if(states[id] && states[id].val){
					let state = id.split(".").pop();
					if(state && state !== undefined && ["muted", 
					"volume",
					"repeat",
					"shuffle",
					"state",
					"current_sid",
					"current_album_id",
					"current_mid",
					"current_type",
					"current_qid",
					"current_elapsed"].includes(state)){
						this.storedState[id.split(".").pop()] = states[id].val;
					}
				}
			}
			this.heos.log.debug("Stored player state: " + JSON.stringify(this.storedState));
		})
	}
	
	restoreState(){
        if(Object.keys(this.storedState).length != 0){
			this.heos.log.debug("Restore player state: " + JSON.stringify(this.storedState));
			
            this.sendCommand("set_mute&state=" + (this.storedState.muted === true ? "on" : "off"));
            this.sendCommand("set_volume&level=" + this.storedState.volume);
            this.sendCommand('set_play_mode&repeat=' + this.storedState.repeat + '&shuffle=' + (this.storedState.shuffle === true ? "on" : "off"));

            if(this.storedState.current_type == "station"){
                //Station
                switch (this.storedState.current_sid) {
                    //TuneIn Radio
                    case 3:
                        this.sendCommand("play_stream&sid=" + this.storedState.current_sid + "&mid=" + this.storedState.current_album_id);
                        break;
                    //Amazon
                    case 13:
                        this.sendCommand("play_stream&sid=" + this.storedState.current_sid + "&mid=" + this.storedState.current_mid);
                        break;
                    //AUX
                    case 1027:
                        this.sendCommand("play_input&input=" + this.storedState.current_mid);
                        break;
                    default:
                        break;
                }
                
            } else {
                //Song
                //Play last queue
                switch (this.storedState.current_sid) {
                    //USB/NAS
                    case 1024:
                        if(this.storedState.current_qid != undefined){
                            this.sendCommand("play_queue&qid=" + this.storedState.current_qid);
                        }
                        break;
                    default:
                        break;
                }
            }
            if(this.storedState.state == "stop"){
                this.restore_timeout = setTimeout(() => {
                    this.sendCommand("set_play_state&state=" + this.storedState.state);
                }, 2000);
			}
			this.timeSeek(this.storedState.current_elapsed);
        }
    }

	/**
	 * Adapted from https://github.com/ioBroker/ioBroker.sonos
	 * @param {*} fileName 
	 * @param {*} volume 
	 */
	tts(fileName, volume){
		this.heos.log.debug("TTS on " + this.name + ": " + fileName + " with volume " + volume);
		if(!this.tts_playing){
			this.storeState();
		}
		if(volume && this.volume_max < volume){
			this.heos.log.info(this.name + ": TTS max volume reached. Reset to: " + this.volume_max);
			volume = this.volume_max;
		}

		if(!this.tts_playing){
			this.sendCommand("set_mute&state=off");
			this.sendCommand('set_play_mode&repeat=off&shuffle=off');
			this.sendCommand("set_volume&level=" + volume);

			this.tts_playing = true;
			this.tts_started = new Date().getTime();
		}
		this.sendCommand('play_stream&url=' + fileName);

		if (this.tts_stop_timeout) {
			clearTimeout(this.tts_stop_timeout);
			this.tts_stop_timeout = undefined;
		}
		if (this.tts_timeout) {
			clearTimeout(this.tts_timeout);
			this.tts_stop_timeout = undefined;
		}
		this.tts_timeout = setTimeout(() => {
			this.heos.log.debug("TTS timeout. Stop.")
			this.stopTTS();
		}, 30000);
	}

	async stopTTS(){
		if(this.tts_playing && !this.tts_stop_timeout){
			if (this.tts_stop_timeout) {
				clearTimeout(this.tts_stop_timeout);
				this.tts_stop_timeout = undefined;
			}
			this.tts_stop_timeout = setTimeout(async () => {
				this.heos.log.debug("Stop TTS.")
				if(this.tts_timeout) {
					clearTimeout(this.tts_timeout);
					this.tts_timeout = undefined;
				}

				//Remove TTS From Queue
				if(this.tts_queue.length){
					this.tts_queue.sort(function(a, b){return b-a}); //DESC
					for (let i = 0; i < this.tts_queue.length; i++) {
						this.sendCommand("remove_from_queue&qid=" + (this.tts_queue[i] + 1));
					}
					this.tts_queue = [];
				}

				let that = this;
				this.tts_stop_restore_timeout = setTimeout(() => {
					that.restoreState();
					that.tts_playing = false;
				}, 1000);
			}, 2000);
        }
	}

	/**
	 * 
	 * @param {number} time
	 * @param {boolean} compact
	 */
	toFormattedTime(time, compact) {
		var s_hours, s_min, s_sec;
		let hours = Math.floor(time / 3600);
		if(hours == 0.0 && compact){
			s_hours = '';
		} else if (hours < 10) {
			s_hours = '0' + hours + ':';
		} else {
			s_hours = hours + ':';
		}
		let min = Math.floor(time / 60) % 60;
		if (min < 10) {
			s_min = '0' + min;
		} else {
			s_min = min;
		}
		let sec = time % 60;
		if (sec < 10) {
			s_sec = '0' + sec;
		} else {
			s_sec = sec;
		}

		return s_hours + s_min + ':' + s_sec;
	}
}

module.exports = HeosPlayer;