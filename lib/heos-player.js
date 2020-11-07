/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2020 withstu <withstu@gmx.de>
 * MIT License
 *
 * derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula
 */
'use strict';

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
		this.muted_ad = false;
		this.error = false;
		this.current_type = '';
		this.storedState = {};
		this.tts_playing = false;
		this.tts_timeout = null;
		this.tts_stop_timeout = null;
		this.tts_queue = [];
		this.tts_started = null;
		this.volume_max = 20;
		this.ignore_broadcast_cmd = true;
		this.auto_play = false;

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

		//Channel
		await this.heos.setObjectNotExistsAsync(this.baseStatePath, {
			type: 'channel',
			common: {
				name: this.name || this.ip,
				role: 'media.music'
			},
			native: {},
		});

		//Meta
		await this.heos.setObjectNotExistsAsync(this.statePath + 'connected', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'command', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'ip', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'pid', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'name', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'model', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'serial', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'network', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'lineout', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'error', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'last_error', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'volume', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'volume_max', {
			type: 'state',
			common: {
				name: 'Maximum player volume',
				desc: 'State and control of max volume',
				type: 'number',
				role: 'level.volume_max',
				read: true,
				write: true,
				min: 0,
				max: 100,
				def: 100
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'muted', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'state', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'state_simple', {
			type: 'state',
			common: {
				name: 'Binary play/pause state',
				desc: 'Play or pause',
				type: 'boolean',
				role: 'media.state',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'repeat', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'shuffle', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_type', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_title', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_station', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_album_id', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_album', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_artist', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_image_url', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_mid', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_sid', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_source_name', {
			type: 'state',
			common: {
				name: 'Current source name',
				desc: 'Source of current played song',
				type: 'string',
				role: 'media.source.name',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_source_image_url', {
			type: 'state',
			common: {
				name: 'Current source image URL',
				desc: 'Source image of current played song',
				type: 'string',
				role: 'media.source.image_url',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_qid', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_elapsed', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_elapsed_s', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_duration', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'current_duration_s', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'queue', {
			type: 'state',
			common: {
				name: 'Queue',
				desc: 'List of the queued items',
				type: 'string',
				role: 'meta.queue',
				read: true,
				write: false,
				def: "[]"
			},
			native: {},
		});

		//Group
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_leader', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_leader_pid', {
			type: 'state',
			common: {
				name: 'Group leader ID',
				desc: 'Player ID of the group leader',
				type: 'string',
				role: 'media.group_leader_pid',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_member', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_pid', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_volume', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_name', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'group_muted', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'play', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'stop', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'pause', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'prev', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'next', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'volume_up', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'volume_down', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'clear_queue', {
			type: 'state',
			common: {
				name: 'Clear queue',
				desc: 'Remove all items from queue',
				type: 'boolean',
				role: 'button.queue.clear',
				read: true,
				write: true
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'auto_play', {
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
		await this.heos.setObjectNotExistsAsync(this.statePath + 'ignore_broadcast_cmd', {
			type: 'state',
			common: {
				name: 'Ignore Broadcast commands',
				desc: 'If true, player ignores commands to all players',
				type: 'boolean',
				role: 'media.ignore_broadcast_cmd',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectNotExistsAsync(this.statePath + 'tts', {
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

		await this.heos.setStateAsync(this.statePath + 'name', this.name, true);
		await this.heos.setStateAsync(this.statePath + 'pid', this.pid, true);
		await this.heos.setStateAsync(this.statePath + 'model', this.model, true);
		await this.heos.setStateAsync(this.statePath + 'version', this.version, true);
		await this.heos.setStateAsync(this.statePath + 'ip', this.ip, true);
		await this.heos.setStateAsync(this.statePath + 'network', this.network, true);
		await this.heos.setStateAsync(this.statePath + 'lineout', this.lineout, true);
		await this.heos.setStateAsync(this.statePath + 'serial', this.serial, true);

		await this.heos.getStateAsync(this.statePath + 'auto_play', (err, state) => {
			this.auto_play = state.val;
		});
		await this.heos.getStateAsync(this.statePath + 'ignore_broadcast_cmd', (err, state) => {
			this.ignore_broadcast_cmd = state.val;
		});
		await this.heos.getStateAsync(this.statePath + 'volume_max', (err, state) => {
			this.volume_max = state.val;
		});
	}

	async connect(){
		this.heos.log.info('connect HEOS player ' + this.name + ' (' + this.pid + ')');

		this.sendCommand('get_play_state|get_play_mode|get_now_playing_media|get_volume');

		setTimeout(async () => {
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
		// connected zurücksetzen
		await this.heos.setStateAsync(this.statePath + "connected", false, true);
	}

	/** Group Leader or no group member  */
	isPlayerLeader(){
		return this.group_member === false || this.group_leader === true;
	}

	/**
	 * 
	 * @param {String} mid 
	 */
	muteSpotifyAd(mid){
		if(this.heos.config.muteSpotifyAds === true){
			if(mid.startsWith("spotify:ad:") && this.muted === false){
				this.muted_ad = true;
				this.sendCommand('set_mute&state=on');
			} else if(!mid.startsWith("spotify:ad:") && this.muted_ad === true){
				this.muted_ad = false;
				this.sendCommand('set_mute&state=off');
			}        
		}
	}

	stringifyReplacer(key,value)
	{
		if (key=="heos") return undefined;
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
							break;
						case 'player_now_playing_progress':
							if(this.error){
								this.resetError(false);
							}
							this.heos.setState(this.statePath + "current_elapsed", jmsg.cur_pos / 1000, true);
							this.heos.setState(this.statePath + "current_elapsed_s", this.toFormattedTime(jmsg.cur_pos / 1000), true);
							this.heos.setState(this.statePath + "current_duration", jmsg.duration / 1000, true);
							this.heos.setState(this.statePath + "current_duration_s", this.toFormattedTime(jmsg.duration / 1000), true);
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
									this.muteSpotifyAd(jdata.payload.mid);
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

	storeState(){
        this.storedState = {};

		let that = this;
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
					"current_qid"].includes(state)){
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
                setTimeout(() => {
                    this.sendCommand("set_play_state&state=" + this.storedState.state);
                }, 2000);
            }
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
						await this.sleep(200);
						this.sendCommand("remove_from_queue&qid=" + (this.tts_queue[i] + 1));
					}
					this.tts_queue = [];
				}

				let that = this;
				setTimeout(() => {
					that.restoreState();
					that.tts_playing = false;
				}, 1000);
			}, 2000);
        }
	}

	async sleep(milliseconds) {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}

	/**
	 * 
	 * @param {number} time 
	 */
	toFormattedTime(time) {
		var s_hours, s_min, s_sec;
		let hours = Math.floor(time / 3600);
		s_hours = (hours) ? (hours + ':') : '';
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