/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2023 withstu <withstu@gmx.de>
 * MIT License
 *
 * derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula
 */
'use strict';

const HeosUPnP = require('./heos-upnp');
const { imageColorExtract } = require('./image-color-extract');
const { ERROR_CODES } = require('./constants');

class HeosPlayer {
	/**
	 * @param {import('../main')} heos Heos Adapter
	 * @param {object} player Json Object from HEOS
	 */
	constructor(heos, player){
		this.heos = heos;

		this.base_state_path = 'players.' + player.pid;
		this.state_path = this.base_state_path + '.';
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
		this.tts_started = null; // TODO: this is only assigned, never used
		this.volume = 0;
		this.volume_limit = 100;
		this.volume_lock = false;
		this.ignore_broadcast_cmd = true;
		this.auto_play = false;
		this.allowed_actions = [];
		this.power = true;

		this.force_autoplay = false;
		this.upnp_states = {};

		//Timeouts
		this.connect_timeout = undefined;
		this.tts_timeout = undefined;
		this.tts_stop_timeout = undefined;
		this.tts_stop_restore_timeout = undefined;
		this.restore_timeout = undefined;
		this.respond_timeout = undefined;
		this.now_playing_update_timeout = undefined;
		
		this.repeatStates = {
			0:'off',
			1:'on_all',
			2:'on_one'
		};
	}

	/**
	 *	Create the initial objects in the database
	 *
	 * @param {object} player Json Object from HEOS
	 * @returns {Promise<void>}
	 */
	async initMetaData(player){
		this.pid = player.pid;
		this.ip = player.ip;
		this.name = player.name;
		this.model = player.model;
		this.serial = (player.serial === undefined) ? '' : player.serial;
		this.version = player.version;
		this.network = player.network;
		this.lineout = player.lineout;

		this.heos.initPlayerStatistics(this.ip);

		//Init Upnp
		this.upnp = new HeosUPnP(this.heos, player.ip);

		//Channel
		await this.heos.setObjectAsync(this.base_state_path, {
			type: 'channel',
			common: {
				name: this.name || this.ip,
				role: 'media.music'
			},
			native: {},
		});

		//Meta
		await this.heos.setObjectAsync(this.state_path + 'connected', {
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
		await this.heos.setObjectAsync(this.state_path + 'power', {
			type: 'state',
			common: {
				name: 'Power state',
				desc: 'True, if device is turned on or not supported by device',
				type: 'boolean',
				role: 'switch.power',
				read: true,
				write: true,
				def: true
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'command', {
			type: 'state',
			common: {
				name: 'Player command',
				desc: 'Send command to player',
				type: 'string',
				role: 'text',
				read: true,
				write: true,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'ip', {
			type: 'state',
			common: {
				name: 'Player IP-Address',
				desc: 'IP Address of the player',
				type: 'string',
				role: 'info.ip',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'settings_url', {
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
		await this.heos.setObjectAsync(this.state_path + 'pid', {
			type: 'state',
			common: {
				name: 'Player ID',
				desc: 'Unique ID of the player',
				type: 'number',
				role: 'value',
				read: true,
				write: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'name', {
			type: 'state',
			common: {
				name: 'Player name',
				desc: 'Name of the player',
				type: 'string',
				role: 'info.name',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'model', {
			type: 'state',
			common: {
				name: 'Player model',
				desc: 'Model of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'version', {
			type: 'state',
			common: {
				name: 'Player version',
				desc: 'Version of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'serial', {
			type: 'state',
			common: {
				name: 'Player serial number',
				desc: 'Serial number of the player',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'network', {
			type: 'state',
			common: {
				name: 'Network connection type',
				desc: 'wired, wifi or unknown',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'lineout', {
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
		await this.heos.setObjectAsync(this.state_path + 'error', {
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
		await this.heos.setObjectAsync(this.state_path + 'last_error', {
			type: 'state',
			common: {
				name: 'Last player error messages',
				desc: 'Last 4 player error messages',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'volume', {
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
		await this.heos.setObjectAsync(this.state_path + 'volume_limit', {
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
		await this.heos.setObjectAsync(this.state_path + 'volume_lock', {
			type: 'state',
			common: {
				name: 'Lock player volume',
				desc: 'Lock volume at the current state',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'muted', {
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
		await this.heos.setObjectAsync(this.state_path + 'state', {
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
		await this.heos.setObjectAsync(this.state_path + 'state_simple', {
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
		await this.heos.setObjectAsync(this.state_path + 'repeat', {
			type: 'state',
			common: {
				name: 'Repeat',
				desc: 'Repeat mode',
				type: 'number',
				role: 'media.mode.repeat',
				read: true,
				write: true,
				states: this.repeatStates,
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'shuffle', {
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
		await this.heos.setObjectAsync(this.state_path + 'seek', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_type', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_title', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_station', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_album_id', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_album', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_artist', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_image_url', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_image_color_palette', {
			type: 'state',
			common: {
				name: 'Current image color palette',
				desc: 'Color palette of image of current played song',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_image_color_background', {
			type: 'state',
			common: {
				name: 'Current image background color',
				desc: 'Background color of image of current played song',
				type: 'string',
				role: 'level.color.rgb',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_image_color_foreground', {
			type: 'state',
			common: {
				name: 'Current image foreground color',
				desc: 'Foreground color of image of current played song',
				type: 'string',
				role: 'level.color.rgb',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_mid', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_sid', {
			type: 'state',
			common: {
				name: 'Current source ID',
				desc: 'Source ID of current played song',
				type: 'number',
				role: 'value',
				read: true,
				write: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_source_name', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_source_image_url', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_qid', {
			type: 'state',
			common: {
				name: 'Current queue ID',
				desc: 'Queue ID of current played song',
				type: 'number',
				role: 'value',
				read: true,
				write: false
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_elapsed', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_elapsed_s', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_duration', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_duration_s', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_bitrate', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_bitdepth', {
			type: 'state',
			common: {
				name: 'Current song bit depth',
				desc: 'Bit depth of current played song',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'bit',
				def: 0
			},
			native: {},
		});
		await this.heos.setObjectAsync(this.state_path + 'current_sample_rate', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_audio_format', {
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
		await this.heos.setObjectAsync(this.state_path + 'current_allowed_actions', {
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
		await this.heos.setObjectAsync(this.state_path + 'queue', {
			type: 'state',
			common: {
				name: 'Queue',
				desc: 'List of the queued items',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
				def: '[]'
			},
			native: {},
		});

		//Group
		await this.heos.setObjectAsync(this.state_path + 'group_leader', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_leader_pid', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_member', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_pid', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_volume', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_name', {
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
		await this.heos.setObjectAsync(this.state_path + 'group_muted', {
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
		await this.heos.setObjectAsync(this.state_path + 'tts', {
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
		await this.heos.setObjectAsync(this.state_path + 'play', {
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
		await this.heos.setObjectAsync(this.state_path + 'stop', {
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
		await this.heos.setObjectAsync(this.state_path + 'pause', {
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
		await this.heos.setObjectAsync(this.state_path + 'prev', {
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
		await this.heos.setObjectAsync(this.state_path + 'next', {
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
		await this.heos.setObjectAsync(this.state_path + 'volume_up', {
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
		await this.heos.setObjectAsync(this.state_path + 'volume_down', {
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
		await this.heos.setObjectAsync(this.state_path + 'clear_queue', {
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
		await this.heos.setObjectAsync(this.state_path + 'reboot', {
			type: 'state',
			common: {
				name: 'Reboot player',
				desc: 'Connect heos to this player and reboot.',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true
			},
			native: {},
		});

		//Configuration
		await this.heos.setObjectAsync(this.state_path + 'auto_play', {
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
		await this.heos.setObjectAsync(this.state_path + 'ignore_broadcast_cmd', {
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

		await this.heos.setStateAsync(this.state_path + 'name', this.name, true);
		await this.heos.setStateAsync(this.state_path + 'pid', this.pid, true);
		await this.heos.setStateAsync(this.state_path + 'model', this.model, true);
		await this.heos.setStateAsync(this.state_path + 'version', this.version, true);
		await this.heos.setStateAsync(this.state_path + 'ip', this.ip, true);
		await this.heos.setStateAsync(this.state_path + 'settings_url', 'http://' + this.ip + '/settings/index.html', true);
		await this.heos.setStateAsync(this.state_path + 'network', this.network, true);
		await this.heos.setStateAsync(this.state_path + 'lineout', this.lineout, true);
		await this.heos.setStateAsync(this.state_path + 'serial', this.serial, true);

		let state = await this.heos.getStateAsync(this.state_path + 'auto_play');
		this.auto_play = state ? state.val : this.auto_play;
		state = await this.heos.getStateAsync(this.state_path + 'ignore_broadcast_cmd');
		this.ignore_broadcast_cmd = state ? state.val : this.ignore_broadcast_cmd;
		state = await this.heos.getStateAsync(this.state_path + 'volume_limit');
		this.volume_limit = state ? state.val : this.volume_limit;
		state = await this.heos.getStateAsync(this.state_path + 'volume_lock');
		this.volume_lock = state ? state.val : this.volume_lock;
		state = await this.heos.getStateAsync(this.state_path + 'volume');
		this.volume = state ? state.val : this.volume;
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
		if (this.now_playing_update_timeout) {
			clearTimeout(this.now_playing_update_timeout);
			this.now_playing_update_timeout = undefined;
		}
	}

	async connect(){
		this.logInfo('connect HEOS player ' + this.name + ' (' + this.pid + ')', false);

		await this.upnp.init();

		this.sendCommand('get_play_state|get_play_mode|get_now_playing_media|get_volume');

		this.connect_timeout = setTimeout(async () => {
			await this.heos.setStateAsync(this.state_path + 'connected', true, true);
			this.connected = true;
			this.autoPlay();
		}, 5000);
	}

	async disconnect(){
		this.logInfo('disconnect HEOS player ' + this.name + ' (' + this.pid + ')', false);
		// activate forced autoplay for follower
		const group_players = this.getGroupPlayers();
		for (let i = 0; i < group_players.length; i++) {
			group_players[i].force_autoplay = true;
			this.logDebug('activate force autoplay for: ' + group_players[i].name, false);
		}
		//cleanup now playing
		await this.cleanupNowPlaying();
		// reset error
		await this.resetError(true);
		// reset timeouts
		await this.resetTimeouts();

		// connected zurücksetzen
		await this.heos.setStateAsync(this.state_path + 'connected', false, true);
	}

	/** Group Leader or no group member  */
	isPlayerGroupLeader(){
		return this.group_member === false || this.group_leader === true;
	}

	isPlayerLeader(){
		return this.heos.ip == this.ip;
	}

	/**
	 *
	 * @param {String} payload
	 */
	muteRegex(payload){
		if(this.heos.config.muteOnRegex === true){
			const regex = RegExp(this.heos.config.muteRegex, 'i');
			this.logDebug("Test regex '" + regex + "' on " + payload + ' with result: ' + regex.test(payload), false);
			if(regex.test(payload) && this.muted === false){
				this.muted_regex = true;
				this.sendCommand('set_mute?state=on');
				this.logInfo('Mute ' + this.name + ', because regex matches', false);
			} else if(!regex.test(payload) && this.muted_regex === true){
				this.muted_regex = false;
				this.sendCommand('set_mute?state=off');
				this.logInfo('Unmute ' + this.name + ', because regex is not matching any more', false);
			}
		}
	}

	stringifyReplacer(key,value)
	{
		if (key=='heos' || key.indexOf('timeout') > -1) return undefined;
		else return value;
	}

	autoPlay(){
		if(this.heos.config.autoPlay === true){
			if(this.auto_play === true) {
				if(this.connected === true
					&& this.muted === false
					&& this.isPlayerGroupLeader()){
					if((this.error === true && this.heos.getFailuresByCode(this.ip, ERROR_CODES.PlaybackError) > 5) || this.current_type.length == 0){
						this.logInfo('auto play default music at ' + this.name, false);
						this.sendCommand(this.heos.config.autoPlayCmd);
					} else if(this.state_simple === false){
						this.logInfo('auto play music at ' + this.name, false);
						this.sendCommand('set_play_state?state=play');
					} else {
						this.logDebug('AutoPlay not started. Already playing.', false);
					}
				} else {
					this.logDebug('AutoPlay not started on player ' + this.name + '. Player is not connected, muted or not a leader.', false);
				}
			} else {
				this.logDebug('AutoPlay is disabled on player ' + this.name, false);
			}
		} else {
			this.logDebug('AutoPlay is disabled in configuration', false);
		}
	}

	reboot(){
		if(this.heos.getReboots(this.ip) < 20){
			if(this.heos.ip == this.ip){
				this.heos.reboot();
			} else {
				this.heos.addRebootIp(this.ip);
				this.logWarn('rebooting player ' + this.name + ' (' + this.ip + ') requested. Needs to reconnect HEOS to the correct player first.', false);
				this.heos.reconnect();
			}
		} else {
			this.logError('adapter is not able to fix health of player ' + this.name + ' (' + this.ip + ') by reboots. Please turn off the power of the player and turn it on after some seconds.', false);
		}
	}

	//Detect not responding players
	detectHeosResponseTimeout(){
		if (this.respond_timeout) {
			clearTimeout(this.respond_timeout);
			this.respond_timeout = undefined;
		}
		if(this.state_simple && this.heos.getUptime(this.ip) >= 5) {
			this.respond_timeout = setTimeout(() => {
				this.setError('HEOS is not responding as expected. Request timed out. Update play state.', ERROR_CODES.Timeout);
				this.sendCommand('get_play_state');
			}, 60000);
		}
	}

	/**
	 *
	 * @param {String} name
	 */
	async setGroupName(name){
		this.group_name = name;
		await this.heos.setStateAsync(this.state_path + 'group_name', this.group_name, true);
	}

	/**
	 *
	 * @param {String} pid
	 */
	async setGroupPid(pid){
		this.group_pid = pid;
		await this.heos.setStateAsync(this.state_path + 'group_pid', this.group_pid, true);
	}

	/**
	 *
	 * @param {boolean} leader
	 */
	async setGroupLeader(leader){
		this.group_leader = leader;
		await this.heos.setStateAsync(this.state_path + 'group_leader', this.group_leader, true);
	}

	/**
	 *
	 * @param {String} pid
	 */
	async setGroupLeaderPid(pid){
		this.group_leader_pid = pid;
		await this.heos.setStateAsync(this.state_path + 'group_leader_pid', this.group_leader_pid, true);
	}

	/**
	 *
	 * @param {boolean} member
	 */
	async setGroupMember(member){
		this.group_member = member;
		await this.heos.setStateAsync(this.state_path + 'group_member', this.group_member, true);
	}

	/**
	 *
	 * @param {number} volume
	 */
	async setGroupVolume(volume){
		this.group_volume = volume;
		await this.heos.setStateAsync(this.state_path + 'group_volume', this.group_volume, true);
	}

	/**
	 *
	 * @param {boolean} muted
	 */
	async setGroupMuted(muted){
		this.group_muted = muted;
		await this.heos.setStateAsync(this.state_path + 'group_muted', this.group_muted, true);
	}

	async cleanupNowPlaying(){
		this.heos.getStates(this.state_path + 'current_*', async (err, states) => {
			for (const id in states) {
				this.heos.setState(id, null, true);
			}
		});
	}

	checkHealth(){
		if(this.heos.getUptime(this.ip) >= 5) {
			//Reboots
			if(this.heos.getReboots(this.ip) >= 10 && this.heos.getReboots(this.ip) < 20 && this.heos.getReboots(this.ip) % 5 == 0){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many reboots. Reboot all.', false);
					this.heos.rebootAll();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many reboots. Reboot all. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}

			//Leader Failures
			if(this.heos.getLeaderFailures(this.ip) >= 20){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many leader failures. Reboot.', false);
					this.heos.clearLeaderFailures(this.ip);
					this.reboot();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many leader failures. Reboot. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}

			//General Failures
			if(this.heos.getFailuresByCode(this.ip, ERROR_CODES.General) >= 10){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many general errors. Reboot.', false);
					this.heos.clearFailuresByCode(this.ip, ERROR_CODES.General);
					this.reboot();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many general errors. Reboot. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}

			//Timeout Failures
			if(this.heos.getFailuresByCode(this.ip, ERROR_CODES.Timeout) >= 5){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many timeouts. Reboot.', false);
					this.heos.clearFailuresByCode(this.ip, ERROR_CODES.Timeout);
					this.reboot();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many timeouts. Reboot. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}

			//Upnp Failures
			if(this.heos.getFailuresByCode(this.ip, ERROR_CODES.Upnp) >= 20){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many upnp failures. Reboot.', false);
					this.heos.clearFailuresByCode(this.ip, ERROR_CODES.Upnp);
					this.reboot();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many upnp failures. Reboot. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}

			//Playback Failures
			if(this.heos.getFailuresByCode(this.ip, ERROR_CODES.PlaybackError >= 10)){
				if(this.heos.config.rebootOnFailure === true) {
					this.logWarn('[setError] Player ' + this.name + ' has to many playback failures. Reboot.', false);
					this.heos.clearFailuresByCode(this.ip, ERROR_CODES.PlaybackError);
					this.reboot();
				} else {
					this.logWarn('[setError] Player ' + this.name + ' has to many playback failures. Reboot. Activate "reboot on failure" in the configuration or reboot manually the device.', false);
				}
			}
		}
		if(this.heos.getUptime(this.ip) > 0 && this.heos.getUptime(this.ip) % 30 == 0) {
			this.heos.reduceReboots(this.ip);
			this.heos.reduceLeaderFailures(this.ip);
			this.heos.reduceFailures(this.ip, ERROR_CODES.Timeout);
			this.heos.reduceFailures(this.ip, ERROR_CODES.Upnp);
			this.heos.reduceFailures(this.ip, ERROR_CODES.PlaybackError);
		}
	}

	/**
	 *
	 * @param {String} message
	 * @param {number} code
	 */
	async setError(message, code) {
		this.error = true;
		this.heos.raiseFailures(this.ip, code);
		if(this.isPlayerLeader()){
			this.heos.raiseLeaderFailures(this.ip);
		}

		this.checkHealth();

		this.heos.setStateChanged(this.state_path + 'error', true, true, (error, id, notChanged) =>{
			if(!notChanged || (this.heos.getFailuresByCode(this.ip, ERROR_CODES.PlaybackError) > 0 && this.heos.getFailuresByCode(this.ip, ERROR_CODES.PlaybackError) < 3)){
				this.autoPlay();
			}
		});
		try {
			this.logWarn('[setError] ' + message, false);
			this.heos.getState(this.state_path + 'last_error',  async (err, state) => {
				if(state) {
					const val = state.val + '';
					const lines = val.split('\n');
					if(lines.includes(message))
						lines.splice(lines.indexOf(message), 1);
					if (lines.length > 4)
						lines.pop();
					lines.unshift(message);
					await this.heos.setStateAsync(this.state_path + 'last_error', lines.join('\n'), true);
				}
			});
		} catch (e) { this.logError('[setLastError] ' + e, false); }
	}

	/**
	 *
	 * @param {boolean} deleteLastError
	 */
	async resetError(deleteLastError){
		this.error = false;
		await this.heos.setStateAsync(this.state_path + 'error', false, true);
		if(deleteLastError)
			await this.heos.setStateAsync(this.state_path + 'last_error', '', true);
	}

	async updateUpnp(){
		if(this.upnp.getServiceList() && Object.keys(this.upnp.getServiceList()).length === 0){
			try{
				await this.upnp.init();
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] failed to init upnp: ' + err, false);
			}
		}
		this.logDebug('[upnp] Allowed Services: ' + JSON.stringify(this.upnp.getServiceList()));
		await this.getUpnpRenderingControlState();
		await this.getUpnpACTState();
		await this.getUpnpGroupControlState();
		await this.getUpnpZoneControlState();
		await this.getUpnpAVTransportState();
	}

	async getUpnpRenderingControlState(){
		const service = 'RenderingControl';
		const action = 'GetCurrentState';
		const data = {
			InstanceID: 0
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			let state;
			let leader_state;
			try{
				const result = await this.upnp.sendCommand(service, action, data);
				this.logSilly('[' + service + '] ' + JSON.stringify(result));

				if(this.isPlayerGroupLeader()){
					state = leader_state = this.upnp_states[service] = result['CurrentState'];
				} else {
					state = this.upnp_states[service] = result['CurrentState'];
					const leader = this.heos.players[this.group_leader_pid];
					if(leader && leader.upnp_states && service in leader.upnp_states){
						leader_state = leader.upnp_states[service];
					} else {
						leader_state = state;
					}
				}
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] get ' + service + ' state failed: ' + err, false);
			}
		} else {
			this.logDebug('[upnp] get ' + service + ' state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
		}
	}

	async getUpnpACTState(){
		const service = 'ACT';
		const action = 'GetCurrentState';
		const data = {
			InstanceID: 0
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			let state;
			let leader_state;
			try{
				const result = await this.upnp.sendCommand(service, action, data);
				this.logSilly('[' + service + '] ' + JSON.stringify(result));

				if(this.isPlayerGroupLeader()){
					state = leader_state = this.upnp_states[service] = result['CurrentState'];
				} else {
					state = this.upnp_states[service] = result['CurrentState'];
					const leader = this.heos.players[this.group_leader_pid];
					if(leader && leader.upnp_states && service in leader.upnp_states){
						leader_state = leader.upnp_states[service];
					} else {
						leader_state = state;
					}
				}
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] get ' + service + ' state failed: ' + err, false);
			}
			if(state
				&& state.DevicePower
				&& state.DevicePower['@_val']){
				this.power = (state.DevicePower['@_val'] == 'ON') ? true : false;
				this.heos.setState(this.state_path + 'power', this.power, true);
			} else {
				this.heos.setState(this.state_path + 'power', null, true);
			}
		} else {
			this.logDebug('[upnp] get ' + service + ' state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
		}
	}

	async getUpnpGroupControlState(){
		const service = 'GroupControl';
		const action = 'GetCurrentState';
		const data = {
			InstanceID: 0
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			let state;
			let leader_state;
			try{
				const result = await this.upnp.sendCommand(service, action, data);
				this.logSilly('[' + service + '] ' + JSON.stringify(result));

				if(this.isPlayerGroupLeader()){
					state = leader_state = this.upnp_states[service] = result['CurrentState'];
				} else {
					state = this.upnp_states[service] = result['CurrentState'];
					const leader = this.heos.players[this.group_leader_pid];
					if(leader && leader.upnp_states && service in leader.upnp_states){
						leader_state = leader.upnp_states[service];
					} else {
						leader_state = state;
					}
				}
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] get ' + service + ' state failed: ' + err, false);
			}
		} else {
			this.logDebug('[upnp] get ' + service + ' state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
		}
	}

	async getUpnpZoneControlState(){
		const service = 'ZoneControl';
		const action = 'GetCurrentState';
		const data = {
			InstanceID: 0
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			let state;
			let leader_state;
			try{
				const result = await this.upnp.sendCommand(service, action, data);
				this.logSilly('[' + service + '] ' + JSON.stringify(result));

				if(this.isPlayerGroupLeader()){
					state = leader_state = this.upnp_states[service] = result['CurrentState'];
				} else {
					state = this.upnp_states[service] = result['CurrentState'];
					const leader = this.heos.players[this.group_leader_pid];
					if(leader && leader.upnp_states && service in leader.upnp_states){
						leader_state = leader.upnp_states[service];
					} else {
						leader_state = state;
					}
				}
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] get ' + service + ' state failed: ' + err, false);
			}
		} else {
			this.logDebug('[upnp] get ' + service + ' state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
		}
	}

	async getUpnpAVTransportState(){
		const service = 'AVTransport';
		const action = 'GetCurrentState';
		const data = {
			InstanceID: 0
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			let state;
			let leader_state;
			try{
				const result = await this.upnp.sendCommand(service, action, data);
				this.logSilly('[' + service + '] ' + JSON.stringify(result));

				if(this.isPlayerGroupLeader()){
					state = leader_state = this.upnp_states[service] = result['CurrentState'];
				} else {
					state = this.upnp_states[service] = result['CurrentState'];
					const leader = this.heos.players[this.group_leader_pid];
					if(leader && leader.upnp_states && service in leader.upnp_states){
						leader_state = leader.upnp_states[service];
					} else {
						leader_state = state;
					}
				}
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] get ' + service + ' state failed: ' + err, false);
			}

			//Track Meta
			if(leader_state
				&& leader_state.CurrentTrackMetaData
				&& leader_state.CurrentTrackMetaData['@_val']){

				const meta = leader_state.CurrentTrackMetaData['@_val'];

				if(leader_state.CurrentTrackMetaData['@_val'].res) {
					const bitrate = '@_bitrate' in meta.res ? Math.trunc(meta.res['@_bitrate'] / 1000) : 0;
					const bitdepth = '@_bitsPerSample' in meta.res ? meta.res['@_bitsPerSample'] : 0;
					const sample_rate = '@_sampleFrequency' in meta.res ? meta.res['@_sampleFrequency'] / 1000 : 0;

					this.heos.setState(this.state_path + 'current_bitrate', bitrate, true);
					this.heos.setState(this.state_path + 'current_bitdepth', bitdepth, true);
					this.heos.setState(this.state_path + 'current_sample_rate', sample_rate, true);
				} else {
					this.heos.setState(this.state_path + 'current_bitrate', null, true);
					this.heos.setState(this.state_path + 'current_bitdepth', null, true);
					this.heos.setState(this.state_path + 'current_sample_rate', null, true);
				}

				let format = '';
				if(meta.desc && Array.isArray(meta.desc)){
					for(const desc of meta.desc){
						if(desc['@_id'] == 'audioFormat'){
							format = desc.value;
						}
					}
				}
				this.heos.setState(this.state_path + 'current_audio_format', format, true);
			} else {
				this.heos.setState(this.state_path + 'current_bitrate', null, true);
				this.heos.setState(this.state_path + 'current_bitdepth', null, true);
				this.heos.setState(this.state_path + 'current_sample_rate', null, true);
				this.heos.setState(this.state_path + 'current_audio_format', null, true);
			}

			if(state
				&& state.CurrentTransportActions
				&& state.CurrentTransportActions['@_val']){
				const actions = state.CurrentTransportActions['@_val'];
				this.allowed_actions = actions.split(',');
				this.heos.setState(this.state_path + 'current_allowed_actions', actions, true);
			} else {
				this.allowed_actions = [];
				this.heos.setState(this.state_path + 'current_allowed_actions', '', true);
			}
		} else {
			this.logDebug('[upnp] get ' + service + ' state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
		}
	}

	async setUpnpDevicePowerState(state){
		const service = 'ACT';
		const action = 'SetDevicePowerState';
		const data = {
			InstanceID: 0,
			devicePower: (state) ? 'ON' : 'OFF'
		};
		if(this.upnp.hasService(service) && this.upnp.hasServiceAction(service, action)){
			try{
				const result = await this.upnp.sendCommand(service, action, data);
			} catch(err){
				this.heos.raiseFailures(this.ip, ERROR_CODES.Upnp);
				this.logWarn('[upnp] set device power state failed: ' + err, false);
			}
		} else {
			this.logWarn('[upnp] set device power state is not supported by player ' + this.name + ' (' + this.ip + ')', false);
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
		const pid = jmsg.pid; // TODO: unused
		
		this.detectHeosResponseTimeout();
		try {
			switch (cmd_group) {
				case 'event':
					switch (cmd) {
						case 'player_playback_error':
							this.setError(jmsg.error.replace(/_/g, ' '), ERROR_CODES.PlaybackError);
							this.sendCommand('get_play_state');
							break;
						case 'player_state_changed':
							this.state = jmsg.state;
							this.state_simple = this.state == 'play' ? true : false;
							this.heos.setState(this.state_path + 'state', this.state, true);
							this.heos.setState(this.state_path + 'state_simple', this.state_simple, true);
							if(this.tts_playing){
								this.stopTTS();
							}
							this.sendCommand('get_now_playing_media', true);
							if(this.state_simple === false && this.force_autoplay === true) {
								this.force_autoplay = false;
								this.logDebug('force autoplay', false);
								this.autoPlay();
							}
							break;
						case 'player_volume_changed':
							let volume = parseFloat(jmsg.level);
							if(this.volume_limit < volume){
								volume = this.volume_limit;
								this.logInfo(this.name + ': Volume limit reached. Reset to: ' + volume, false);
								this.sendCommand('set_volume?level=' + volume);
							}
							if(this.volume_lock && this.volume != volume){
								this.logInfo(this.name + ': Volume lock enabled. Reset to: ' + this.volume, false);
								this.sendCommand('set_volume?level=' + this.volume);
							} else {
								this.volume = volume;
								this.heos.setStateChanged(this.state_path + 'volume', volume, true);
								const newMuted = (jmsg.mute == 'on' ? true : false);
								this.muted = newMuted;
								this.heos.setStateChanged(this.state_path + 'muted', newMuted, true, (error, id, notChanged) =>{
									if(!notChanged){
										this.autoPlay();
									}
								});
							}
							break;
						case 'repeat_mode_changed':
							this.heos.setState(this.state_path + 'repeat', this.getRepeatStateKey(jmsg.repeat), true);
							break;
						case 'shuffle_mode_changed':
							this.heos.setState(this.state_path + 'shuffle', (jmsg.shuffle == 'on' ? true : false), true);
							break;
						case 'player_now_playing_changed':
							this.sendCommand('get_now_playing_media', true);
							break;
						case 'player_now_playing_progress':
							if(this.error){
								this.resetError(false);
								this.heos.clearFailures(this.ip);
							}
							this.current_duration = jmsg.duration / 1000;
							this.heos.setState(this.state_path + 'current_elapsed', jmsg.cur_pos / 1000, true);
							this.heos.setState(this.state_path + 'current_elapsed_s', this.toFormattedTime(jmsg.cur_pos / 1000, true), true);
							this.heos.setState(this.state_path + 'current_duration', this.current_duration, true);
							this.heos.setState(this.state_path + 'current_duration_s', this.toFormattedTime(this.current_duration, true), true);
							if(this.state_simple === false){
								this.sendCommand('get_play_state');
							}
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
							this.heos.getState(this.state_path + 'volume',  async (err, state) => {
								if (state == null || state == undefined || state.val != jmsg.level){
									let volume = parseFloat(jmsg.level);
									if(this.volume_limit < volume){
										volume = this.volume_limit;
										this.logInfo(this.name + ': Volume limit reached. Reset to: ' + volume, false);
										this.sendCommand('set_volume?level=' + volume);
									}
									if(this.volume_limit < volume){
										volume = this.volume_limit;
										this.logInfo(this.name + ': Volume limit reached. Reset to: ' + volume, false);
										this.sendCommand('set_volume?level=' + volume);
									}
									if(this.volume_lock && this.volume != volume){
										this.logInfo(this.name + ': Volume lock enabled. Reset to: ' + this.volume, false);
										this.sendCommand('set_volume?level=' + this.volume);
									} else {
										this.volume = volume;
										this.heos.setState(this.state_path + 'volume', volume, true);
									}
								}
							});
							break;
						case 'set_mute':
						case 'get_mute':
							this.heos.setState(this.state_path + 'muted', (jmsg.state == 'on' ? true : false), true);
							this.muted = (jmsg.state == 'on' ? true : false);
							break;
						case 'set_play_state':
						case 'get_play_state':
							if(jmsg.state != 'unknown'){
								this.state = jmsg.state;
								this.state_simple = this.state == 'play' ? true : false;
								this.heos.setState(this.state_path + 'state', this.state, true);
								this.heos.setState(this.state_path + 'state_simple', this.state_simple, true);
							}
							break;
						case 'set_play_mode':
						case 'get_play_mode':
							this.heos.setState(this.state_path + 'repeat', this.getRepeatStateKey(jmsg.repeat), true);
							this.heos.setState(this.state_path + 'shuffle', (jmsg.shuffle == 'on' ? true : false), true);
							break;
						case 'get_now_playing_media':
							//Update now playing every 30 seconds
							if (this.now_playing_update_timeout) {
								clearTimeout(this.now_playing_update_timeout);
								this.now_playing_update_timeout = undefined;
							}
							this.now_playing_update_timeout = setTimeout(async () => {
								this.sendCommand('get_now_playing_media');
							}, 30000);

							//Filter invalid responses
							if(jdata.payload.hasOwnProperty('sid') && jdata.payload.sid != 0){
								this.muteRegex(JSON.stringify(jdata.payload));

								if (jdata.payload.hasOwnProperty('sid')) {
									this.heos.setState(this.state_path + 'current_sid', jdata.payload.sid, true);
									const source = this.heos.mapSource(jdata.payload.sid);
									if(source){
										this.heos.setState(this.state_path + 'current_source_name', source.name, true);
										this.heos.setState(this.state_path + 'current_source_image_url', source.image_url, true);
									} else {
										this.heos.getState('sources.' + jdata.payload.sid + '.name',  async (err, state) => {
											if(state && state.val && !state.notExist){
												this.heos.setState(this.state_path + 'current_source_name', state.val + '', true);
											} else {
												this.heos.setState(this.state_path + 'current_source_name', '', true);
											}
										});
										this.heos.getState('sources.' + jdata.payload.sid + '.image_url',  async (err, state) => {
											if(state && state.val && !state.notExist){
												this.heos.setState(this.state_path + 'current_source_image_url', state.val + '', true);
											} else {
												this.heos.setState(this.state_path + 'current_source_image_url', '', true);
											}
										});
									}
								} else {
									this.heos.setState(this.state_path + 'current_sid', null, true);
									this.heos.setState(this.state_path + 'current_source_name', null, true);
									this.heos.setState(this.state_path + 'current_source_image_url', null, true);
								}

								if (jdata.payload.hasOwnProperty('type')) {
									this.heos.setState(this.state_path + 'current_type', jdata.payload.type, true);
									this.current_type = jdata.payload.type;
									if (jdata.payload.type == 'station') {
										this.heos.setState(this.state_path + 'current_station', jdata.payload.station, true);
									} else {
										this.heos.setState(this.state_path + 'current_station', '', true);
									}
								} else {
									this.heos.setState(this.state_path + 'current_type', '', true);
									this.current_type = '';
								}

								if (jdata.payload.hasOwnProperty('song')) {
									this.heos.setState(this.state_path + 'current_title', jdata.payload.song, true);
								} else {
									this.heos.setState(this.state_path + 'current_title', '', true);
								}

								if (jdata.payload.hasOwnProperty('album')) {
									this.heos.setState(this.state_path + 'current_album', jdata.payload.album, true);
								} else {
									this.heos.setState(this.state_path + 'current_album', '', true);
								}

								if (jdata.payload.hasOwnProperty('album_id')) {
									this.heos.setState(this.state_path + 'current_album_id', jdata.payload.album_id, true);
								} else {
									this.heos.setState(this.state_path + 'current_album_id', '', true);
								}

								if (jdata.payload.hasOwnProperty('artist')) {
									this.heos.setState(this.state_path + 'current_artist', jdata.payload.artist, true);
								} else {
									this.heos.setState(this.state_path + 'current_artist', '', true);
								}

								if (jdata.payload.hasOwnProperty('image_url')) {
									this.heos.setState(this.state_path + 'current_image_url', jdata.payload.image_url, true);

									if(jdata.payload.image_url){
										try {
											const imageColors = await imageColorExtract(jdata.payload.image_url);
											this.heos.setState(this.state_path + 'current_image_color_palette', JSON.stringify(imageColors.colorPalette), true);
											this.heos.setState(this.state_path + 'current_image_color_background', imageColors.backgroundColor, true);
											this.heos.setState(this.state_path + 'current_image_color_foreground', imageColors.foregroundColor, true);
										} catch(colorerr){
											this.logDebug('Image color extraction failed');
											this.heos.setState(this.state_path + 'current_image_color_palette', '', true);
											this.heos.setState(this.state_path + 'current_image_color_background', '', true);
											this.heos.setState(this.state_path + 'current_image_color_foreground', '', true);
										}
									} else {
										this.heos.setState(this.state_path + 'current_image_color_palette', '', true);
										this.heos.setState(this.state_path + 'current_image_color_background', '', true);
										this.heos.setState(this.state_path + 'current_image_color_foreground', '', true);
									}
								} else {
									this.heos.setState(this.state_path + 'current_image_url', '', true);

									this.heos.setState(this.state_path + 'current_image_color_palette', '', true);
									this.heos.setState(this.state_path + 'current_image_color_background', '', true);
									this.heos.setState(this.state_path + 'current_image_color_foreground', '', true);
								}

								if (jdata.payload.hasOwnProperty('mid')) {
									this.heos.setState(this.state_path + 'current_mid', jdata.payload.mid, true);
								} else {
									this.heos.setState(this.state_path + 'current_mid', '', true);
								}

								if (jdata.payload.hasOwnProperty('qid')) {
									this.heos.setStateChanged(this.state_path + 'current_qid', jdata.payload.qid, true, (error, id, notChanged) =>{
										if(!notChanged){
											let qid;
											if(jdata.payload.qid){
												qid = jdata.payload.qid - 1;
												if(qid < 0){
													qid = 0;
												}
												if(!this.tts_playing){
													this.sendCommand('get_queue?range=' + qid + ',' + (qid + 50));
												}
												if(this.tts_playing
													&& jdata.payload.hasOwnProperty('song')
													&& jdata.payload.song == 'Url Stream'
													&& !this.tts_queue.includes(qid)){
													this.tts_queue.push(qid);
												} else if(this.tts_playing
													&& jdata.payload.hasOwnProperty('song')
													&& jdata.payload.song != 'Url Stream'){
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
									this.heos.setStateChanged(this.state_path + 'current_qid', null, true, (error, id, notChanged) =>{
										if(!notChanged && !this.tts_playing){
											this.sendCommand('get_queue');
										}
									});
								}

								//Update Upnp
								if(this.isPlayerGroupLeader()){
									await this.updateUpnp();
									const group_players = this.getGroupPlayers();
									for (var i = 0; i < group_players.length; i++) {
										await group_players[i].updateUpnp();
									}
								}
							} else {
								this.logDebug('get_now_playing_media response ignored. Invalid sid.', false);
							}
							break;
						case 'get_queue':
							if(jmsg.hasOwnProperty('count')){
								jmsg.count = parseInt(jmsg.count);
							}
							if(jmsg.hasOwnProperty('returned')){
								jmsg.returned = parseInt(jmsg.returned);
							}
							const queue = {
								'name': 'Queue',
								'image_url': '',
								'parameter': jmsg,
								'payload': []
							};
							//Load previous
							if (jmsg.returned < jmsg.count) {
								var start = 1;
								var end = 50;
								var pageCmd = '';
								if(jmsg.hasOwnProperty('range')){
									const range = jmsg.range.split(',');
									start = parseInt(range[0]) + 1;
									end = parseInt(range[1]) + 1;
								}
								if(start > 1){
									end = start - 1;
									start = end - 50;
									if(start < 1) {
										start = 1;
									}
									for(const key in jmsg){
										if(!['range', 'returned', 'count'].includes(key)){
											pageCmd += (pageCmd.length > 0 ? '&' : '') + key + '=' + jmsg[key];
										}
									}
									if(pageCmd.length > 0){
										pageCmd = 'player/get_queue?' + pageCmd + '&range=' + (start - 1) + ',' + (end - 1);
										queue['payload'].push(
											{
												'name': 'load_prev',
												'image_url': '',
												'type': 'control',
												'available': true,
												'commands': {
													'browse': pageCmd
												}
											}
										);
									}
								}
							}

							//Queue items
							for (var i = 0; i < jdata.payload.length; i++) {
								const payload = jdata.payload[i];
								payload['name'] = '';
								payload['type'] = 'media';
								payload['available'] = true;
								payload['commands'] = {
									'play': 'player/play_queue?pid=' + this.pid + '&qid=' + payload.qid
								};
								queue['payload'].push(payload);
							}

							//Load next
							if (jmsg.returned < jmsg.count) {
								var start = 1;
								var end = 50;
								var pageCmd = '';
								if(jmsg.hasOwnProperty('range')){
									const range = jmsg.range.split(',');
									start = parseInt(range[0]) + 1;
									end = parseInt(range[1]) + 1;
								}
								if(end < jmsg.count){
									start = end + 1;
									end = start + 50;
									if(end > jmsg.count) {
										end = jmsg.count;
									}
									for(const key in jmsg){
										if(!['range', 'returned', 'count'].includes(key)){
											pageCmd += (pageCmd.length > 0 ? '&' : '') + key + '=' + jmsg[key];
										}
									}
									if(pageCmd.length > 0){
										pageCmd = 'player/get_queue?' + pageCmd + '&range=' + (start - 1) + ',' + (end - 1);
										queue['payload'].push(
											{
												'name': 'load_next',
												'image_url': '',
												'type': 'control',
												'available': true,
												'commands': {
													'browse': pageCmd
												}
											}
										);
									}
								}
							}
							this.heos.setState(this.state_path + 'queue', JSON.stringify(queue), true);
							break;
					}
					break;
			} // switch
		} catch (err) { this.logError('[parseResponse] ' + err, false);}
	}

	/**
	 * cmd der Form "cmd&param"  werden zur msg heos+cmd+pid+&param aufbereitet
	 * cmd der Form "cmd?param"  werden zur msg heos+cmd+?param aufbereitet
	 * @param {String} cmd
	 */
	commandToMsg(cmd) {
		let addPid = true;
		let s_param = '';
		let param = cmd.split('?');
		cmd = param.shift() + '';
		if (param.length > 0) s_param = param.join('?'); else s_param = '';
		//Deprecated behaviour
		if(cmd.includes('&')){
			this.logWarn('Deprecated: Please use a ? as delimiter between cmd and parameters: ' + cmd);
			param = cmd.split('&');
			cmd = param.shift() + '';
			if (param.length > 0) s_param = param.join('&'); else s_param = '';
		}
		let cmd_group = 'player';

		switch (cmd) {
			case 'set_group_mute':
				cmd = 'set_mute';
				if(this.group_member === true){
					cmd_group = 'group';
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'set_group_volume':
				cmd = 'set_volume';
				if(this.group_member === true){
					cmd_group = 'group';
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'group_volume_up':
				cmd = 'volume_up';
				if(this.group_member === true){
					cmd_group = 'group';
					s_param = 'gid=' + this.group_leader_pid + (s_param.length > 0 ? '&' + s_param : '');
					addPid = false;
				}
				break;
			case 'group_volume_down':
				cmd = 'volume_down';
				if(this.group_member === true){
					cmd_group = 'group';
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
			return cmd_group + '/' + cmd + '?pid=' + this.pid + (s_param.length > 0 ? '&' + s_param : '');
		} else {
			return cmd_group + '/' + cmd + '?' + s_param;
		}
	}

	/**
	 * Nachricht (command) an player senden
	 * es sind auch mehrere commands, getrennt mit | erlaubt
	 * bsp: set_volume&level=20|play_preset&preset=1
	 * @param {String} cmd
	 */
	sendCommand(cmd, ignore_duplicate_check = false) {
		this.detectHeosResponseTimeout();

		const cmds = cmd.split('|');
		for (let c = 0; c < cmds.length; c++) {
			this.heos.queueMsg(this.commandToMsg(cmds[c]), ignore_duplicate_check);
		}
	}

	async timeSeek(seconds){
		if(!this.allowed_actions.includes('Seek')){
			this.logWarn('seek is currently not available', false);
		} else {
			const target = this.toFormattedTime(seconds, false);

			const service = 'AVTransport';
			const action = 'Seek';
			const data = {
				InstanceID: 0,
				Unit: 'REL_TIME',
				Target: target
			};
			try{
				const result = await this.upnp.sendCommand(service, action, data);
			} catch(err){
				this.logWarn('seek failed:' + err, false);
			}
		}
	}

	getGroupPlayers(){
		const group = [];

		if(this.group_leader === true) {
			const pids = this.group_pid.split(',');
			for (let i = 0; i < pids.length; i++) {
				const pid = pids[i].trim();
				if(pid != this.pid){
					const player = this.heos.players[pid];
					if (player) {
						group.push(player);
					}
				}
			}
		}

		return group;
	}

	getRepeatStateName(id){
		let name = this.repeatStates[0];
		if(id in this.repeatStates){
			name = this.repeatStates[id];
		}
		return name;
	}

	/**
	 * 
	 * @param {*} object 
	 * @param {*} value 
	 * @returns {number|string|undefined}
	 */
	getKeyByValue(object, value) {
		return Object.keys(object).find(key => object[key] === value);
	}

	getRepeatStateKey(name){
		let id = this.getKeyByValue(this.repeatStates, name);
		if(id == undefined){
			id = 0;
		}
		if(typeof id == 'string'){
			id = parseInt(id);
		}
		return id;
	}

	storeState(){
		this.storedState = {};

		this.heos.getStates(this.state_path + '*', async (err, states) => {
			for (const id in states) {
				if(states[id] && states[id].val){
					const state = id.split('.').pop();
					if(state && state !== undefined && ['muted',
						'volume',
						'repeat',
						'shuffle',
						'state',
						'current_sid',
						'current_album_id',
						'current_mid',
						'current_type',
						'current_qid',
						'current_elapsed'].includes(state)){
						this.storedState[id.split('.').pop()] = states[id].val;
					}
				}
			}
			this.logDebug('Stored player state: ' + JSON.stringify(this.storedState), false);
		});
	}

	restoreState(){
		if(Object.keys(this.storedState).length != 0){
			this.logDebug('Restore player state: ' + JSON.stringify(this.storedState), false);

			this.sendCommand('set_mute?state=' + (this.storedState.muted === true ? 'on' : 'off'));
			this.sendCommand('set_volume?level=' + this.storedState.volume);
			this.sendCommand('set_play_mode?repeat=' + this.getRepeatStateName(this.storedState.repeat) + '&shuffle=' + (this.storedState.shuffle === true ? 'on' : 'off'));

			if(this.storedState.current_type == 'station'){
				//Station
				switch (this.storedState.current_sid) {
					//TuneIn Radio
					case 3:
						this.sendCommand('play_stream?sid=' + this.storedState.current_sid + '&mid=' + this.storedState.current_album_id);
						break;
						//Amazon
					case 13:
						this.sendCommand('play_stream?sid=' + this.storedState.current_sid + '&mid=' + this.storedState.current_mid);
						break;
						//AUX
					case 1027:
						this.sendCommand('play_input?input=' + this.storedState.current_mid);
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
							this.sendCommand('play_queue?qid=' + this.storedState.current_qid);
						}
						break;
					default:
						break;
				}
			}
			if(this.storedState.state == 'stop'){
				this.restore_timeout = setTimeout(() => {
					this.sendCommand('set_play_state?state=' + this.storedState.state);
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
		this.logDebug('TTS on ' + this.name + ': ' + fileName + ' with volume ' + volume, false);
		if(!this.tts_playing){
			this.storeState();
		}
		if(volume && this.volume_limit < volume){
			this.logInfo(this.name + ': TTS volume limit reached. Reset to: ' + this.volume_limit, false);
			volume = this.volume_limit;
		}

		if(!this.tts_playing){
			this.sendCommand('set_mute?state=off');
			this.sendCommand('set_play_mode?repeat=off&shuffle=off');
			this.sendCommand('set_volume?level=' + volume);

			this.tts_playing = true;
			this.tts_started = new Date().getTime();
		}
		this.sendCommand('play_stream?url=' + fileName);

		if (this.tts_stop_timeout) {
			clearTimeout(this.tts_stop_timeout);
			this.tts_stop_timeout = undefined;
		}
		if (this.tts_timeout) {
			clearTimeout(this.tts_timeout);
			this.tts_stop_timeout = undefined;
		}
		this.tts_timeout = setTimeout(() => {
			this.logDebug('TTS timeout. Stop.', false);
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
				this.logDebug('Stop TTS.', false);
				if(this.tts_timeout) {
					clearTimeout(this.tts_timeout);
					this.tts_timeout = undefined;
				}

				//Remove TTS From Queue
				if(this.tts_queue.length){
					this.tts_queue.sort(function(a, b){return b-a;}); //DESC
					for (let i = 0; i < this.tts_queue.length; i++) {
						this.sendCommand('remove_from_queue?qid=' + (this.tts_queue[i] + 1));
					}
					this.tts_queue = [];
				}

				this.tts_stop_restore_timeout = setTimeout(() => {
					this.restoreState();
					this.tts_playing = false;
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
		let s_hours, s_min, s_sec;
		const hours = Math.floor(time / 3600);
		if(hours == 0.0 && compact){
			s_hours = '';
		} else if (hours < 10) {
			s_hours = '0' + hours + ':';
		} else {
			s_hours = hours + ':';
		}
		const min = Math.floor(time / 60) % 60;
		if (min < 10) {
			s_min = '0' + min;
		} else {
			s_min = min;
		}
		const sec = time % 60;
		if (sec < 10) {
			s_sec = '0' + sec;
		} else {
			s_sec = sec;
		}

		return s_hours + s_min + ':' + s_sec;
	}

	logInfo(msg, force){
		this.heos.logInfo('[' + this.name + '] ' + msg, force);
	}

	logWarn(msg, force){
		this.heos.logWarn('[' + this.name + '] ' + msg, force);
	}

	logError(msg, force){
		this.heos.logError('[' + this.name + '] ' + msg, force);
	}

	logDebug(msg, force){
		this.heos.logDebug('[' + this.name + '] ' + msg, force);
	}

	logSilly(msg, force){
		this.heos.logSilly('[' + this.name + '] ' + msg, force);
	}
}

module.exports = HeosPlayer;