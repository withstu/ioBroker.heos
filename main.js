/**
 * ioBroker HEOS Adapter
 * Copyright (c) 2023 withstu <withstu@gmx.de>
 * MIT License
 *
 * derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula
 */
'use strict';

const utils = require('@iobroker/adapter-core');

const net = require('net');
const NodeSSDP = require('node-ssdp').Client;
const HeosPlayer = require('./lib/heos-player');
const { STATES, ERROR_CODES } = require('./lib/constants');


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
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.resetVars(true);
	}

	resetVars(initMode) {
		this.players = {};
		this.browse_cmd_map = {};
		this.ip = '';
		this.state = STATES.Disconnected;
		this.signed_in = false;

		this.heartbeat_retries = 0;
		this.heartbeat_interval = undefined;
		this.ssdp_search_interval = undefined;
		this.ssdp_search_timeout = undefined;

		this.start_players_errors = 0;
		this.ssdp_retry_counter = 0;
		this.known_player_ips = [];

		this.ssdp_player_ips = [];

		this.reconnect_timeout = undefined;
		this.reboot_timeout = undefined;

		this.net_client = undefined;
		this.nodessdp_client = undefined;
		this.msgs = [];
		this.request_time = {};
		this.unfinished_responses = '';
		this.ssdp_search_target_name = 'urn:schemas-denon-com:device:ACT-Denon:1';

		this.source_map = {
			1: {
				name: 'Pandora ',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/pandora.png'
			},
			2: {
				name: 'Rhapsody',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/rhapsody.png'
			},
			3: {
				name: 'TuneIn',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/tunein.png'
			},
			4: {
				name: 'Spotify',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/spotify.png'
			},
			5: {
				name: 'Deezer',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/deezer.png'
			},
			6: {
				name: 'Napster',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/napster.png'
			},
			7: {
				name: 'iHeartRadio',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/iheartradio.png'
			},
			8: {
				name: 'Sirius XM',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/siriusxm.png'
			},
			9: {
				name: 'Soundcloud',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/soundcloud.png'
			},
			10: {
				name: 'Tidal',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/tidal.png'
			},
			11: {
				name: 'Future service',
				image_url: ''
			},
			12: {
				name: 'Rdio',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/rdio.png'
			},
			13: {
				name: 'Amazon Music',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/amazon.png'
			},
			14: {
				name: 'Future service',
				image_url: ''
			},
			15: {
				name: 'Moodmix',
				image_url: ''
			},
			16: {
				name: 'Juke',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/juke.png'
			},
			17: {
				name: 'Future service',
				image_url: ''
			},
			18: {
				name: 'QQMusic',
				image_url: ''
			},
			1024: {
				name: 'Local USB Media/ Local DLNA servers',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/musicsource_logo_servers.png'
			},
			1025: {
				name: 'HEOS Playlists ',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/musicsource_logo_playlists.png'
			},
			1026: {
				name: 'HEOS History',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/musicsource_logo_history.png'
			},
			1027: {
				name: 'HEOS aux inputs',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/musicsource_logo_aux.png'
			},
			1028: {
				name: 'HEOS Favorites',
				image_url: 'https://production.ws.skyegloup.com/media/images/service/logos/musicsource_logo_favorites.png'
			}
		};

		if (initMode) {
			this.manual_search_mode = true;
			this.silent_log_mode = false;
			this.offline_mode = false;

			this.reboot_ips = [];
			this.reboot_counter = {};
			this.reboot_time = {};
			this.failure_counter = {};
			this.leader_failure_counter = {};
			this.prefered_player_ips = [];

			this.next_connect_ip = '';
		}
	}

	logInfo(msg, force) {
		if (!force && this.silent_log_mode) {
			this.log.debug(msg);
		} else {
			this.log.info(msg);
		}
	}

	logWarn(msg, force) {
		if (!force && this.silent_log_mode) {
			this.log.debug(msg);
		} else {
			this.log.warn(msg);
		}
	}

	logError(msg, force) {
		if (!force && this.silent_log_mode) {
			this.log.debug(msg);
		} else {
			this.log.error(msg);
		}
	}

	logDebug(msg, force) {
		this.log.debug(msg);
	}

	logSilly(msg, force) {
		this.log.silly(msg);
	}

	async onReady() {
		await this.setObjectAsync('players', {
			type: 'device',
			common: {
				name: 'List of HEOS players',
				role: 'media'
			},
			native: {},
		});
		await this.setObjectAsync('command', {
			type: 'state',
			common: {
				name: 'HEOS command',
				desc: 'Send command to HEOS',
				type: 'string',
				role: 'text',
				read: true,
				write: true
			},
			native: {},
		});
		await this.setObjectAsync('command_scope_pid', {
			type: 'state',
			common: {
				name: 'Command Scope Player IDs',
				desc: 'Comma separated pid list to scope the command, if configured',
				type: 'string',
				role: 'text',
				read: true,
				write: true,
				def: ''
			},
			native: {},
		});
		await this.setObjectAsync('connected_ip', {
			type: 'state',
			common: {
				name: 'Connected IP address',
				desc: 'IP address to which the adapter is connected to',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: ''
			},
			native: {},
		});
		await this.setObjectAsync('signed_in', {
			type: 'state',
			common: {
				name: 'Sign-in status',
				desc: 'True, if a user is signed in',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.setObjectAsync('signed_in_user', {
			type: 'state',
			common: {
				name: 'Signed-in user',
				desc: 'Username of the signed in user',
				type: 'string',
				role: 'text',
				read: true,
				write: false
			},
			native: {},
		});
		await this.setObjectAsync('error', {
			type: 'state',
			common: {
				name: 'Error status',
				desc: 'True, if an error exists',
				type: 'boolean',
				role: 'indicator.maintenance',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.setObjectAsync('last_error', {
			type: 'state',
			common: {
				name: 'Last error messages',
				desc: 'Last 4 error messages',
				type: 'string',
				role: 'text',
				read: true,
				write: false
			},
			native: {},
		});
		await this.setObjectAsync('offline_mode', {
			type: 'state',
			common: {
				name: 'Offline Mode',
				desc: 'If true, heos will not sign-in',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);
		this.setState('connected_ip', '', true);

		//Root
		this.subscribeStates('command');
		this.subscribeStates('offline_mode');
		try {
			const state = await this.getStateAsync('offline_mode');
			this.offline_mode = state.val;
		} catch {
			// ignore
		}

		//Presets|Playlists
		this.subscribeStates('sources.*.play');

		//Sources
		this.subscribeStates('sources.*.browse');

		//Players
		this.subscribeStates('players.*.muted');
		this.subscribeStates('players.*.repeat');
		this.subscribeStates('players.*.shuffle');
		this.subscribeStates('players.*.state');
		this.subscribeStates('players.*.state_simple');
		this.subscribeStates('players.*.volume');
		this.subscribeStates('players.*.volume_limit');
		this.subscribeStates('players.*.volume_lock');
		this.subscribeStates('players.*.volume_up');
		this.subscribeStates('players.*.volume_down');
		this.subscribeStates('players.*.seek');
		this.subscribeStates('players.*.current_elapsed');
		this.subscribeStates('players.*.current_elapsed_s');
		this.subscribeStates('players.*.clear_queue');
		this.subscribeStates('players.*.reboot');
		this.subscribeStates('players.*.group_volume');
		this.subscribeStates('players.*.group_muted');
		this.subscribeStates('players.*.command');
		this.subscribeStates('players.*.power');
		this.subscribeStates('players.*.play');
		this.subscribeStates('players.*.stop');
		this.subscribeStates('players.*.pause');
		this.subscribeStates('players.*.next');
		this.subscribeStates('players.*.prev');
		this.subscribeStates('players.*.auto_play');
		this.subscribeStates('players.*.ignore_broadcast_cmd');
		this.subscribeStates('players.*.tts');

		this.main();
	}

	/**
	 * Is called when adapter shuts down
	 */
	async onUnload() {
		await this.disconnect();
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} _id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(_id, state) {
		if (!state || state.ack) return;
		const id = this.idToDCS(_id);
		const fullId = _id.split('.');

		this.logDebug('State change - ID: ' + _id + ' | DCS: ' + JSON.stringify(id) + ' | State: ' + JSON.stringify(state), false);

		if (id) {
			if (state.val === 'false') {
				state.val = false;
			}
			if (state.val === 'true') {
				state.val = true;
			}
			if (parseInt(state.val) == state.val) {
				state.val = parseInt(state.val);
			}
			if (id.device === 'command') {
				this.executeCommand(state.val);
			} else if (id.device === 'offline_mode') {
				this.offline_mode = state.val;
				if (this.signed_in && state.val) {
					this.signOut();
				} else if (!this.signed_in && !state.val) {
					this.signIn();
				}
			} else if (id.device === 'sources' && id.channel === '1025' && id.state && fullId[fullId.length - 1] === 'play') {
				this.sendCommandToAllPlayers('add_to_queue?sid=1025&aid=' + this.config.queueMode + '&cid=' + id.state, true);
			} else if (id.device === 'sources' && id.channel === '1028' && id.state && fullId[fullId.length - 1] === 'play') {
				this.sendCommandToAllPlayers('play_preset?preset=' + id.state, true);
			} else if (id.device === 'sources' && id.channel && id.state === 'browse') {
				this.browseSource(id.channel);
			} else if (id.device === 'players' && id.channel && id.state) {
				if (id.channel in this.players && this.players[id.channel]) {
					const player = this.players[id.channel];
					if (id.state === 'muted') {
						player.sendCommand('set_mute?state=' + (state.val === true ? 'on' : 'off'));
					} else if (id.state === 'repeat') {
						player.sendCommand('set_play_mode?repeat=' + player.getRepeatStateName(state.val));
					} else if (id.state === 'shuffle') {
						player.sendCommand('set_play_mode?shuffle=' + (state.val === true ? 'on' : 'off'));
					} else if (id.state === 'state') {
						player.sendCommand('set_play_state?state=' + state.val);
					} else if (id.state === 'state_simple') {
						if (state.val === true) {
							player.sendCommand('set_play_state?state=play');
						} else {
							player.sendCommand('set_play_state?state=pause');
						}
					} else if (id.state === 'volume') {
						let volume = state.val;
						if (volume && player.volume_limit < volume) {
							this.logWarn('Volume limit reached. Reset to: ' + player.volume_limit, false);
							volume = player.volume_limit;
						}
						if (player.volume_lock && player.volume != volume) {
							this.logInfo(player.name + ': Volume lock enabled. Reset to: ' + player.volume, false);
							volume = player.volume;
						}
						player.sendCommand('set_volume?level=' + volume);
					} else if (id.state === 'volume_limit') {
						player.volume_limit = state.val;
					} else if (id.state === 'volume_lock') {
						player.volume_lock = state.val;
					} else if (id.state === 'group_volume') {
						player.sendCommand('set_group_volume?level=' + state.val);
					} else if (id.state === 'group_muted') {
						player.sendCommand('set_group_mute?state=' + (state.val === true ? 'on' : 'off'));
					} else if (id.state === 'command') {
						player.sendCommand(state.val);
					} else if (id.state === 'power') {
						player.setUpnpDevicePowerState(state.val);
					} else if (id.state === 'seek') {
						let percent = state.val;
						if (state.val < 0) {
							percent = 0;
						}
						if (state.val > 100) {
							percent = 100;
						}
						if (player.isPlayerGroupLeader()) {
							player.timeSeek(Math.round((player.current_duration * percent) / 100));
						} else {
							const leader = this.players[player.group_leader_pid];
							if (leader) {
								leader.timeSeek(Math.round((leader.current_duration * percent) / 100));
							}
						}
					} else if (id.state === 'current_elapsed') {
						if (player.isPlayerGroupLeader()) {
							player.timeSeek(state.val);
						} else {
							const leader = this.players[player.group_leader_pid];
							if (leader) {
								leader.timeSeek(state.val);
							}
						}
					} else if (id.state === 'current_elapsed_s') {
						let seconds = 0;
						if (state.val) {
							const parts = state.val.toString().split(':');
							if (parts.length === 3) {
								seconds = parseInt(parts[0]) * 3600;
								seconds += parseInt(parts[1]) * 60;
								seconds = parseInt(parts[2]);
							} else if (parts.length === 2) {
								seconds = parseInt(parts[0]) * 60;
								seconds += parseInt(parts[1]);
							} else if (parts.length === 1) {
								seconds = parseInt(parts[0]);
							} else {
								return this.logError('invalid elapsed time: ' + state.val, false);
							}
						}
						if (player.isPlayerGroupLeader()) {
							player.timeSeek(seconds);
						} else {
							const leader = this.players[player.group_leader_pid];
							if (leader) {
								leader.timeSeek(seconds);
							}
						}
					} else if (id.state === 'play') {
						player.sendCommand('set_play_state?state=play');
					} else if (id.state === 'pause') {
						player.sendCommand('set_play_state?state=pause');
					} else if (id.state === 'stop') {
						player.sendCommand('set_play_state?state=stop');
					} else if (id.state === 'prev') {
						player.sendCommand('play_previous');
					} else if (id.state === 'next') {
						player.sendCommand('play_next');
					} else if (id.state === 'volume_up') {
						player.sendCommand('volume_up?step=' + this.config.volumeStepLevel);
					} else if (id.state === 'volume_down') {
						player.sendCommand('volume_down?step=' + this.config.volumeStepLevel);
					} else if (id.state === 'clear_queue') {
						player.sendCommand('clear_queue');
					} else if (id.state === 'reboot') {
						player.reboot();
					} else if (id.state === 'auto_play') {
						player.auto_play = state.val;
					} else if (id.state === 'ignore_broadcast_cmd') {
						player.ignore_broadcast_cmd = state.val;
					} else if (id.state === 'tts') {
						this.text2speech(state.val, player.pid, null);
					}
				} else if (id.state === 'reboot') {
					this.getState(id.device + '.' + id.channel + '.ip', async (err, state) => {
						if (state) {
							const val = state.val + '';
							this.addRebootIp(val);
							this.logWarn('rebooting player ' + this.ip + ' requested. Needs to reconnect HEOS to the correct player first.', true);
							this.reconnect();
						} else {
							this.logWarn('Player ' + id.channel + ' not connected. Can not update ' + id.state, true + '.');
						}
					});
				} else {
					this.logWarn('Player ' + id.channel + ' not connected. Can not update ' + id.state, true + '.');
				}
			}
		}
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		if (typeof obj === 'object' && obj.message) {
			if (obj.command === 'send') {
				obj.message && this.text2speech(obj.message);

				// Send response in callback if required
				if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
			}
		}
	}

	async onNodeSSDPResponse(headers, statusCode, rinfo) {
		this.logSilly('Header: ' + JSON.stringify(headers), false);
		this.logSilly('Status Code: ' + JSON.stringify(statusCode), false);
		this.logSilly('rinfo: ' + JSON.stringify(rinfo), false);
		try {
			// rinfo {"address":"192.168.2.225","family":"IPv4","port":53871,"size":430}
			const ip = rinfo.address;
			if (headers.ST == this.ssdp_search_target_name && !this.ssdp_player_ips.includes(ip)) {
				this.ssdp_player_ips.push(ip);
				this.logDebug('SSDP Announced IPs ' + JSON.stringify(this.ssdp_player_ips), false);
			}
		} catch (err) { this.logError('[onNodeSSDPResponse] ' + err, false); }
	}

	executeCommand(cmd) {
		//('command: '+cmd);
		// cmd auswerten
		cmd = cmd.split('/');
		let cmd_group = null;
		if (cmd.length > 1) {
			cmd_group = cmd.shift();
			cmd = cmd.join('/');
		} else {
			cmd = cmd[0];
		}
		let commandFallback = false;
		switch (cmd_group) {
			case 'system':
				switch (cmd) {
					case 'load_sources':
						this.getMusicSources();
						break;
					case 'connect':
						this.disconnect();
						this.search();
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
					case 'reboot_all':
						this.rebootAll();
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
				if (!cmd.includes('pid=')) {
					this.sendCommandToAllPlayers(cmd, false);
				} else {
					commandFallback = true;
				}
				break;
			case 'leader':
				this.sendCommandToAllPlayers(cmd, true);
				break;
			case 'scope':
				if (this.config.cmdScope == 'all') {
					this.sendCommandToAllPlayers(cmd, false);
				} else if (this.config.cmdScope == 'pid') {
					this.getState('command_scope_pid', async (err, state) => {
						if (state && state.val) {
							const value = state.val + '';
							const pids = value.split(',');
							for (let i = 0; i < pids.length; i++) {
								const pid = pids[i].trim();
								const heosPlayer = this.players[pid];
								if (heosPlayer) {
									heosPlayer.sendCommand(cmd);
								}
							}
						} else {
							this.sendCommandToAllPlayers(cmd, true);
						}
					});
				} else {
					this.sendCommandToAllPlayers(cmd, true);
				}
				break;
			default:
				commandFallback = true;
				break;
		}

		if (commandFallback && this.state == STATES.Connected) {
			if (cmd_group == null) {
				this.queueMsg(cmd);
			} else {
				this.queueMsg(cmd_group + '/' + cmd);
			}
		}
	}

	setLastError(error) {
		this.raiseLeaderFailures(this.ip);
		this.getState('error', async (err, state) => {
			if (state && state.val !== true) {
				await this.setStateAsync('error', true, true);
			}
		});
		this.getState('last_error', async (err, state) => {
			if (state) {
				try {
					this.logWarn('[setLastError] ' + error, false);
					const val = state.val + '';
					const lines = val.split('\n');
					if (lines.includes(error))
						lines.splice(lines.indexOf(error), 1);
					if (lines.length > 4)
						lines.pop();
					lines.unshift(error);
					await this.setStateAsync('last_error', lines.join('\n'), true);
				} catch (e) { this.logError('[setLastError] ' + e, false); }
			}
		});
	}

	logData(prefix, data) {
		if (data.toString().includes('sign_in')) {
			this.logSilly(prefix + ': ' + data.toString(), false);
			this.logDebug(prefix + ': sign_in - sensitive data hidden', false);
		} else {
			this.logDebug(prefix + ': ' + data.toString(), false);
		}
	}

	getAllIndexes(arr, val) {
		let indexes = [], i;
		for (i = 0; i < arr.length; i++)
			if (arr[i] === val)
				indexes.push(i);
		return indexes;
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
		this.logData('onData', data);
		try {
			data = data.toString();
			data = data.replace(/[\n\r]/g, '');    // Steuerzeichen "CR" entfernen
			// es können auch mehrere Antworten vorhanden sein! {"heos": ... } {"heos": ... }
			// diese nun in einzelne Antworten zerlegen
			data = this.unfinished_responses + data;
			this.unfinished_responses = '';

			let lastResponse = '';
			const responses = data.split(/(?={"heos")/g);
			for (let r = 0; r < responses.length; r++) {
				if (responses[r].trim().length > 0) {
					const response = responses[r].trim();
					try {
						JSON.parse(response); // check ob korrektes JSON Array
						if (lastResponse !== response) {
							if (this.state == STATES.Connected) {
								this.parseResponse(response);
								lastResponse = response;
							} else {
								this.logDebug('Received data in wrong state ' + this.state + '. Skip.', true);
							}
						} else {
							this.logData('Skip duplicate response', response);
						}
					} catch (e) {
						this.logData('onData: invalid json (error: ' + e.message + ')', response);
						this.unfinished_responses += responses[r];
					}
				}
			}
			// wenn weitere Msg zum Senden vorhanden sind, die nächste senden
			if (this.msgs.length > 0) {
				this.sendNextMsg();
			}
		} catch (err) { this.logError('[onData] ' + err, false); }
	}

	parseMessage(message) {
		const result = {};
		if (message != null && message.trim().length > 0) {
			const params = message.split('&');
			for (let i = 0; i < params.length; i++) {
				let entry = params[i];
				try {
					entry = decodeURI(entry);
				} catch (e) {
					// ignore a malformed URI
				}
				const param = entry.split('=');
				if (param.length > 1) {
					result[param[0]] = param[1];
				} else {
					result[param[0]] = null;
				}
			}
		}
		return result;
	}

	mapBrowseCmd(command, name, image_url, parent) {
		let entry;
		command = command.replace(/&range.*/, '').replace(/&count.*/, '').replace(/&returned.*/, '');
		if (command in this.browse_cmd_map) {
			entry = this.browse_cmd_map[command];
		} else {
			entry = {
				'name': name,
				'image_url': image_url,
				'parent': parent
			};
			if (name.length > 0) {
				this.browse_cmd_map[command] = entry;
			}
		}
		this.logSilly('BrowseCmdMap: ' + JSON.stringify(this.browse_cmd_map), false);
		return entry;
	}

	mapSource(sid) {
		let result;
		if (sid in this.source_map) {
			result = this.source_map[sid];
		}
		return result;
	}

	async createSource(folderPath, source) {
		const baseStatePath = folderPath + '.' + source.sid;
		const statePath = baseStatePath + '.';
		//Folder
		await this.setObjectAsync(baseStatePath, {
			type: 'folder',
			common: {
				name: source.name,
				role: 'media.source'
			},
			native: {},
		});

		//States
		await this.setObjectAsync(statePath + 'sid', {
			type: 'state',
			common: {
				name: 'Source ID',
				desc: 'ID of the source',
				type: 'number',
				role: 'media.sid',
				read: true,
				write: false
			},
			native: {},
		});
		await this.setObjectAsync(statePath + 'name', {
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
		await this.setObjectAsync(statePath + 'type', {
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
		await this.setObjectAsync(statePath + 'image_url', {
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
		await this.setObjectAsync(statePath + 'available', {
			type: 'state',
			common: {
				name: 'Available',
				desc: 'Source is available',
				type: 'boolean',
				role: 'media.available',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});
		await this.setObjectAsync(statePath + 'browse', {
			type: 'state',
			common: {
				name: 'Browse Source',
				desc: 'Browse and update source. Output is written to browse_result.',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
				def: false
			},
			native: {},
		});

		await this.setStateAsync(statePath + 'sid', source.sid, true);
		await this.setStateAsync(statePath + 'name', source.name, true);
		await this.setStateAsync(statePath + 'type', source.type, true);
		await this.setStateAsync(statePath + 'image_url', source.image_url, true);
		await this.setStateAsync(statePath + 'available', (source.available == 'true' ? true : false), true);

		this.source_map[source.sid] = source;
	}

	async createPlaylist(folderPath, payload) {
		const itemId = payload.cid;
		const baseStatePath = folderPath + '.' + itemId;
		const statePath = baseStatePath + '.';
		//Folder
		await this.setObjectAsync(baseStatePath, {
			type: 'folder',
			common: {
				name: payload.name || 'Playlist ' + itemId,
				role: 'media.playlist'
			},
			native: {},
		});

		//States
		await this.setObjectAsync(statePath + 'id', {
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
		await this.setObjectAsync(statePath + 'name', {
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
		await this.setObjectAsync(statePath + 'playable', {
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
		if (payload.playable == 'yes') {
			await this.setObjectAsync(statePath + 'play', {
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
		await this.setObjectAsync(statePath + 'type', {
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
		await this.setObjectAsync(statePath + 'image_url', {
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
		await this.setObjectAsync(statePath + 'container', {
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
		if (payload.container == 'yes') {
			await this.setObjectAsync(statePath + 'cid', {
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
			await this.setObjectAsync(statePath + 'mid', {
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
		if (payload.playable == 'yes') {
			await this.setStateAsync(statePath + 'play', (payload.playable == 'yes' ? true : false), true);
		}
		await this.setStateAsync(statePath + 'type', payload.type, true);
		await this.setStateAsync(statePath + 'image_url', payload.image_url, true);
		await this.setStateAsync(statePath + 'container', (payload.container == 'yes' ? true : false), true);
		if (payload.container == 'yes') {
			await this.setStateAsync(statePath + 'cid', payload.cid, true);
		} else {
			await this.setStateAsync(statePath + 'mid', payload.mid, true);
		}
	}

	async createPreset(folderPath, itemId, payload) {
		const baseStatePath = folderPath + '.' + itemId;
		const statePath = baseStatePath + '.';

		//Folder
		await this.setObjectAsync(baseStatePath, {
			type: 'folder',
			common: {
				name: 'Preset ' + itemId,
				role: 'media.preset'
			},
			native: {},
		});

		//States
		await this.setObjectAsync(statePath + 'id', {
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
		await this.setObjectAsync(statePath + 'name', {
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
		await this.setObjectAsync(statePath + 'playable', {
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
		if (payload.playable == 'yes') {
			await this.setObjectAsync(statePath + 'play', {
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
		await this.setObjectAsync(statePath + 'type', {
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
		await this.setObjectAsync(statePath + 'image_url', {
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
		await this.setObjectAsync(statePath + 'container', {
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
		if (payload.container == 'yes') {
			await this.setObjectAsync(statePath + 'cid', {
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
			await this.setObjectAsync(statePath + 'mid', {
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
		if (payload.playable == 'yes') {
			await this.setStateAsync(statePath + 'play', (payload.playable == 'yes' ? true : false), true);
		}
		await this.setStateAsync(statePath + 'type', payload.type, true);
		await this.setStateAsync(statePath + 'image_url', payload.image_url, true);
		await this.setStateAsync(statePath + 'container', (payload.container == 'yes' ? true : false), true);
		if (payload.container == 'yes') {
			await this.setStateAsync(statePath + 'cid', payload.cid, true);
		} else {
			await this.setStateAsync(statePath + 'mid', payload.mid, true);
		}
	}

	/** Antwort(en) verarbeiten.
	 **/
	async parseResponse(response) {
		try {
			if (response.includes('sign_in')) {
				this.logSilly('parseResponse: ' + response, false);
				this.logDebug('parseResponse: sign_in - sensitive data hidden', false);
			} else {
				this.logDebug('parseResponse: ' + response, false);
			}

			if (response.indexOf('command under process') > 0)
				return;

			let i;
			const jdata = JSON.parse(response);
			if (!jdata.hasOwnProperty('heos') || !jdata.heos.hasOwnProperty('command'))
				return;

			let command = jdata.heos.command;
			if (jdata.heos.message != null && jdata.heos.message.trim().length > 0) {
				command += '?' + jdata.heos.message;
			}

			//Clear request timeout
			this.deleteRequestTime(command);

			// msg auswerten
			const jmsg = this.parseMessage(jdata.heos.message);

			// result ?
			let result = 'success';
			if (jdata.heos.hasOwnProperty('result')) result = jdata.heos.result;
			if (result != 'success') {
				switch (jmsg.text) {
					case 'User not logged in':
						this.signed_in = false;
						await this.setStateAsync('signed_in', false, true);
						await this.setStateAsync('signed_in_user', '', true);
						this.signIn();
						break;
					case 'Processing previous command':
						//this.reboot();
						break;
				}
				this.setLastError('result=' + result + ',text=' + jmsg.text + ',command=' + jdata.heos.command);
				return; //Stop Parsing, because of error
			} else {
				this.getState('error', async (err, state) => {
					if (state && state.val !== false) {
						await this.setStateAsync('error', false, true);
					}
				});
			}

			// cmd auswerten
			let cmd = jdata.heos.command.split('/');
			const cmd_group = cmd[0];
			cmd = cmd[1];
			switch (cmd_group) {
				case 'system':
					switch (cmd) {
						case 'heart_beat':
							this.resetHeartbeatRetries(true);
							break;
						case 'sign_in':
							//await this.setStateAsync('signed_in', true, true);
							//await this.setStateAsync('signed_in_user', jmsg.un, true);
							//this.getMusicSources();
							break;
					}
					break;
				case 'event':
					switch (cmd) {
						case 'sources_changed':
							this.getMusicSources();
							break;
						case 'user_changed':
							this.logDebug('sign: ' + JSON.stringify(jmsg), false);
							if ('signed_in' in jmsg) {
								this.signed_in = true;
								await this.setStateAsync('signed_in', true, true);
								await this.setStateAsync('signed_in_user', jmsg.un, true);
							} else {
								this.signed_in = false;
								await this.setStateAsync('signed_in', false, true);
								await this.setStateAsync('signed_in_user', '', true);
								this.signIn();
							}
							this.getMusicSources();
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
									const leadHeosPlayer = this.players[jmsg.gid];
									if (leadHeosPlayer) {
										var memberPids = leadHeosPlayer.group_pid.split(',');
										for (let i = 0; i < memberPids.length; i++) {
											const pid = memberPids[i];
											const heosPlayer = this.players[pid];
											if (heosPlayer) {
												heosPlayer.setGroupVolume(parseFloat(jmsg.level));
											}
										}
									}
								}
								if (jmsg.hasOwnProperty('mute')) {
									const leadHeosPlayer = this.players[jmsg.gid];
									if (leadHeosPlayer) {
										var memberPids = leadHeosPlayer.group_pid.split(',');
										for (let i = 0; i < memberPids.length; i++) {
											const pid = memberPids[i];
											const heosPlayer = this.players[pid];
											if (heosPlayer) {
												heosPlayer.setGroupMuted(jmsg.mute == 'on' ? true : false);
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
								var folderPath = 'sources';
								//Folder
								await this.setObjectAsync(folderPath, {
									type: 'folder',
									common: {
										name: 'Sources',
										role: 'media.sources'
									},
									native: {},
								});
								await this.setObjectAsync(folderPath + '.' + 'browse_result', {
									type: 'state',
									common: {
										name: 'Browse result',
										desc: 'Result of the browse command',
										type: 'string',
										role: 'text',
										read: true,
										write: false,
										def: '{}'
									},
									native: {},
								});
								//Clear browse Map to reduce memory;
								this.browse_cmd_map = {};

								const sources = this.mapBrowseCmd(command, 'sources', '', '');
								const browseResult = {
									'name': sources.name,
									'image_url': sources.image_url,
									'parameter': jmsg,
									'payload': []
								};
								//jdata.payload.sort(function(a, b) {
								//	return a.name.localeCompare(b.name);
								//});
								for (i = 0; i < jdata.payload.length; i++) {
									const payload = jdata.payload[i];
									const browse = 'browse/browse?sid=' + payload.sid;
									const source = this.mapBrowseCmd(browse, decodeURIComponent(payload.name), payload.image_url, 'browse/get_music_sources');
									this.createSource(folderPath, payload);
									browseResult['payload'].push(
										{
											'name': source.name,
											'image_url': source.image_url,
											'type': 'media',
											'available': (payload.available == 'true' ? true : false),
											'commands': {
												'browse': browse
											}
										}
									);
								}
								this.setState('sources.browse_result', JSON.stringify(browseResult), true);
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
								const sid = parseInt(jmsg.sid, 10);
								const source = this.mapBrowseCmd(command, '', '', '');
								if (jmsg.hasOwnProperty('count')) {
									jmsg.count = parseInt(jmsg.count);
								}
								if (jmsg.hasOwnProperty('returned')) {
									jmsg.returned = parseInt(jmsg.returned);
								}
								const browseResult = {
									'name': source.name,
									'image_url': source.image_url,
									'parameter': jmsg,
									'payload': []
								};
								//Save index before sorting
								for (i = 0; i < jdata.payload.length; i++) {
									const payload = jdata.payload[i];
									payload.index = i;
								}
								//Sort by name
								//jdata.payload.sort(function(a, b) {
								//	return a.name.localeCompare(b.name);
								//});

								//Add top
								const sources = this.mapBrowseCmd('browse/get_music_sources', '', '', '');
								browseResult['payload'].push(
									{
										'name': sources.name,
										'image_url': sources.image_url,
										'type': 'control',
										'available': true,
										'commands': {
											'browse': 'browse/get_music_sources'
										}
									}
								);

								//Back button
								if (source.parent.length > 0) {
									browseResult['payload'].push(
										{
											'name': 'back',
											'image_url': '',
											'type': 'control',
											'available': true,
											'commands': {
												'browse': source.parent
											}
										}
									);
								}

								//Add play all
								let playable = false;
								for (i = 0; i < jdata.payload.length; i++) {
									const payload = jdata.payload[i];
									if (payload.playable == 'yes') {
										playable = true;
									}
									if (payload.type != 'song') {
										playable = false;
										break;
									}
								}
								if (playable) {
									browseResult['payload'].push(
										{
											'name': 'play_all',
											'image_url': '',
											'type': 'control',
											'available': true,
											'commands': {
												'play': 'scope/add_to_queue?sid=' + sid + '&cid=' + jmsg.cid + '&aid=' + this.config.queueMode
											}
										}
									);
								}

								//Load previous
								if (jmsg.returned < jmsg.count) {
									var start = 1;
									var end = 50;
									var pageCmd = '';
									if (jmsg.hasOwnProperty('range')) {
										const range = jmsg.range.split(',');
										start = parseInt(range[0]) + 1;
										end = parseInt(range[1]) + 1;
									}
									if (start > 1) {
										end = start - 1;
										start = end - 50;
										if (start < 1) {
											start = 1;
										}
										for (const key in jmsg) {
											if (!['range', 'returned', 'count'].includes(key)) {
												pageCmd += (pageCmd.length > 0 ? '&' : '') + key + '=' + jmsg[key];
											}
										}
										if (pageCmd.length > 0) {
											pageCmd = 'browse/browse?' + pageCmd + '&range=' + (start - 1) + ',' + (end - 1);
											browseResult['payload'].push(
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

								switch (sid) {
									case 1025:
										var folderPath = 'sources.1025';
										//Folder
										const playlists = [];
										for (i = 0; i < jdata.payload.length; i++) {
											const payload = jdata.payload[i];
											playlists.push(payload.cid);
											if (payload.name.length == 0) {
												payload.name = 'Unknown';
											}
											this.createPlaylist(folderPath, payload);
											browseResult['payload'].push(
												{
													'name': unescape(decodeURIComponent(payload.name)),
													'image_url': payload.image_url,
													'type': 'media',
													'available': true,
													'commands': {
														'play': 'scope/add_to_queue?sid=1025&aid=' + this.config.queueMode + '&cid=' + payload.cid
													}
												}
											);
										}
										if (jdata.payload.length) {
											this.getStates(folderPath + '.*', async (err, states) => {
												for (const id in states) {
													if (states[id] && states[id].val) {
														const idSplit = id.split('.');
														const state = idSplit[idSplit.length - 1];
														if (state == 'cid') {
															if (!playlists.includes(states[id].val)) {
																this.logWarn('deleting playlist: ' + states[id].val, false);
																this.delObject(folderPath + '.' + states[id].val, { recursive: true });
															}
														}
													}
												}
											});
										}
										break;
									case 1028:
										var folderPath = 'sources.1028';
										//Folder
										const presets = [];
										for (i = 0; i < jdata.payload.length; i++) {
											const payload = jdata.payload[i];
											if (payload.name.length == 0) {
												payload.name = 'Unknown';
											}
											const presetId = payload.index + 1;
											presets.push(presetId);
											this.createPreset(folderPath, presetId, payload);
											browseResult['payload'].push(
												{
													'name': unescape(decodeURIComponent(payload.name)),
													'image_url': payload.image_url,
													'type': 'media',
													'available': true,
													'commands': {
														'play': 'scope/play_preset?preset=' + presetId
													}
												}
											);
										}
										if (jdata.payload.length) {
											this.getStates(folderPath + '.*', async (err, states) => {
												for (const id in states) {
													if (states[id] && states[id].val) {
														const idSplit = id.split('.');
														const state = idSplit[idSplit.length - 1];
														if (state == 'id') {
															if (!presets.includes(states[id].val)) {
																this.logWarn('deleting preset: ' + states[id].val, false);
																this.delObject(folderPath + '.' + states[id].val, { recursive: true });
															}
														}
													}
												}
											});
										}
										break;
									default:
										//Add payload items
										for (i = 0; i < jdata.payload.length; i++) {
											const payload = jdata.payload[i];
											if (payload.name.length == 0) {
												payload.name = 'Unknown';
											}
											browseResult['payload'].push(
												{
													'name': unescape(decodeURIComponent(payload.name)),
													'image_url': payload.image_url,
													'type': 'media',
													'available': true,
													'commands': this.browse2Commands(jmsg, payload)
												}
											);
										}
								}

								//Load next
								if (jmsg.returned < jmsg.count) {
									var start = 1;
									var end = 50;
									var pageCmd = '';
									if (jmsg.hasOwnProperty('range')) {
										const range = jmsg.range.split(',');
										start = parseInt(range[0]) + 1;
										end = parseInt(range[1]) + 1;
									}
									if (end < jmsg.count) {
										start = end + 1;
										end = start + 50;
										if (end > jmsg.count) {
											end = jmsg.count;
										}
										for (const key in jmsg) {
											if (!['range', 'returned', 'count'].includes(key)) {
												pageCmd += (pageCmd.length > 0 ? '&' : '') + key + '=' + jmsg[key];
											}
										}
										if (pageCmd.length > 0) {
											pageCmd = 'browse/browse?' + pageCmd + '&range=' + (start - 1) + ',' + (end - 1);
											browseResult['payload'].push(
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
								this.setState('sources.browse_result', JSON.stringify(browseResult), true);
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
									const leadHeosPlayer = this.players[jmsg.gid];
									if (leadHeosPlayer) {
										var memberPids = leadHeosPlayer.group_pid.split(',');
										for (let i = 0; i < memberPids.length; i++) {
											const pid = memberPids[i];
											const heosPlayer = this.players[pid];
											if (heosPlayer) {
												heosPlayer.setGroupVolume(parseFloat(jmsg.level));
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
									const leadHeosPlayer = this.players[jmsg.gid];
									if (leadHeosPlayer) {
										var memberPids = leadHeosPlayer.group_pid.split(',');
										for (let i = 0; i < memberPids.length; i++) {
											const pid = memberPids[i];
											const heosPlayer = this.players[pid];
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
							for (const pid in this.players) {
								const player = this.players[pid];
								if (player) {
									await player.setGroupName('');
									await player.setGroupPid('');
									await player.setGroupLeaderPid('');
									await player.setGroupLeader(false);
									await player.setGroupMember(false);
								}
							}

							// payload mit den groups auswerten
							if ((jdata.hasOwnProperty('payload'))) {
								for (i = 0; i < jdata.payload.length; i++) {
									const group = jdata.payload[i];
									const players = group.players;
									// Player IDs addieren. Hinweis: "leader" ist nicht immer der 1.Playereintrag
									group.pid = '';
									for (let p = 0; p < players.length; p++) {
										if (players[p].role == 'leader')
											group.pid = players[p].pid + (group.pid.length > 0 ? ',' : '') + group.pid;
										else
											group.pid = group.pid + (group.pid.length > 0 ? ',' : '') + players[p].pid;
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
							this.logInfo('signed in: ' + jdata.heos.result, false);
							break;
					}
					break;
			}

			// an die zugehörigen Player weiterleiten
			if (jmsg.hasOwnProperty('pid')) {
				const heosPlayer = this.players[jmsg.pid];
				if (heosPlayer) {
					heosPlayer.parseResponse(jdata, jmsg, cmd_group, cmd);
				}
			}

		} catch (err) { this.logError('[parseResponse] ' + err + '\n ' + response); }
	}

	browse2Commands(message, payload) {
		const cmd = {};
		let msid;
		let psid;
		let mcid;
		let pcid;
		let mid;
		let playable = false;
		let container = false;
		let type;

		if (message.hasOwnProperty('sid')) {
			msid = message.sid;
		}
		if (payload.hasOwnProperty('sid')) {
			psid = payload.sid;
		}
		if (message.hasOwnProperty('cid')) {
			mcid = message.cid;
		}
		if (payload.hasOwnProperty('cid')) {
			pcid = payload.cid;
		}
		if (payload.hasOwnProperty('mid')) {
			mid = payload.mid;
		}
		if (payload.hasOwnProperty('type')) {
			type = payload.type;
		}
		if (payload.hasOwnProperty('playable')) {
			playable = payload.playable == 'yes' ? true : false;
		}
		if (payload.hasOwnProperty('container')) {
			container = payload.container == 'yes' ? true : false;
		}

		//browse
		if (psid) {
			cmd.browse = 'browse/browse?sid=' + psid;
		} else if (container) {
			const cmdTmp = [];
			if (msid) {
				cmdTmp.push('sid=' + msid);
			}
			if (pcid) {
				cmdTmp.push('cid=' + pcid);
			} else if (mcid) {
				cmdTmp.push('cid=' + mcid);
			}
			if (pcid || mcid) {
				cmdTmp.push('range=0,49');
			}

			if (cmdTmp.length > 0) {
				cmd.browse = 'browse/browse?' + cmdTmp.join('&');
			}

		}

		//Parent
		let parentCmd = '';
		const parentCmdTmp = [];
		if (msid) {
			parentCmdTmp.push('sid=' + msid);
		}
		if (mcid) {
			parentCmdTmp.push('cid=' + mcid);
		}
		if (parentCmdTmp.length > 0) {
			parentCmd = 'browse/browse?' + parentCmdTmp.join('&');
		}

		if ('browse' in cmd) {
			this.mapBrowseCmd(cmd.browse, unescape(decodeURIComponent(payload.name)), payload.image_url, parentCmd);
		}

		//playable
		if (playable && type) {
			if (type == 'station' && mid) {
				if (mid.includes('inputs/')) {
					cmd.play = 'scope/play_input?input=' + mid;
				} else if (mcid) {
					cmd.play = 'scope/play_stream?sid=' + msid + '&cid=' + mcid + '&mid=' + mid;
				} else {
					cmd.play = 'scope/play_stream?sid=' + msid + '&mid=' + mid;
				}
			} else if (container && pcid) {
				cmd.play = 'scope/add_to_queue?sid=' + msid + '&cid=' + pcid + '&aid=' + this.config.queueMode;
			} else if (mcid && mid) {
				cmd.play = 'scope/add_to_queue?sid=' + msid + '&cid=' + mcid + '&mid=' + mid + '&aid=' + this.config.queueMode;
			}
		}

		return cmd;
	}

	sendCommandToAllPlayers(cmd, leaderOnly) {
		if (this.state == STATES.Connected) {
			for (const pid in this.players) {
				const player = this.players[pid];
				if (player && player.ignore_broadcast_cmd === false && (!leaderOnly || (leaderOnly && player.isPlayerGroupLeader()))) {
					player.sendCommand(cmd);
				}
			}
		}
	}

	ttsToAllPlayers(fileName, volume, leaderOnly) {
		if (this.state == STATES.Connected) {
			for (const pid in this.players) {
				const player = this.players[pid];
				if (player && player.ignore_broadcast_cmd === false && (!leaderOnly || (leaderOnly && player.isPlayerGroupLeader()))) {
					player.tts(fileName, volume);
				}
			}
		}
	}

	/**
	 * Adapted from https://github.com/ioBroker/ioBroker.sonos
	 * @param {*} fileName
	 * @param {*} callback
	 */
	text2speech(fileName, pid, callback) {
		this.logInfo('TTS: ' + fileName + ' | PID: ' + pid, false);
		// Extract volume
		let volume = null;

		const pos = fileName.indexOf(';');
		if (pos !== -1) {
			volume = fileName.substring(0, pos);
			fileName = fileName.substring(pos + 1);
		}

		fileName = fileName.trim();

		// play http/https urls directly on heos device
		if (fileName && fileName.match(/^https?:\/\//)) {
			if (pid in this.players) {
				const player = this.players[pid];
				if (player) {
					player.tts(fileName, volume);
				} else {
					this.ttsToAllPlayers(fileName, volume, true);
				}
			} else {
				this.ttsToAllPlayers(fileName, volume, true);
			}

			callback && callback();
		} else {
			this.logError('invalid filename specified');
			callback && callback('invalid filename specified');
		}
	}

	/**
	 *
	 * @param {String} pid
	 */
	async stopPlayer(pid) {
		const player = this.players[pid];
		if (player) {
			await player.disconnect();
		}
		// player leeren
		delete this.players[pid];
	}

	// Für die gefundenen HEOS Player entsprechende class HeosPlayer Instanzen bilden und nicht mehr verbundene Player stoppen
	async startPlayers(payload) {
		try {
			const connectedPlayers = [];
			const foundPlayerIps = [];
			for (let i = 0; i < payload.length; i++) {
				let playerConnected = true;
				const player = payload[i];
				var pid = player.pid + ''; //Convert to String
				if (player.hasOwnProperty('ip') && player.ip != '127.0.0.1') {
					foundPlayerIps.push(player.ip);
				}
				if (!player.name || !player.hasOwnProperty('ip') || player.ip == '127.0.0.1') {
					this.start_players_errors += 1;
					this.logDebug('Start players payload error: ' + JSON.stringify(payload), false);
					if (this.start_players_errors > 4) {
						this.start_players_errors = 0;
						if (this.config.rebootOnFailure === true) {
							this.logWarn('HEOS is not responding as expected. Reboot.', false);
							this.reboot();
						} else {
							this.logWarn('Device failure detected. Activate "reboot on failure" in the configuration or reboot manually.', true);
						}
					}
					throw new Error('HEOS responded with invalid data.');
				} else {
					if (!(pid in this.players)) {
						const heosPlayer = this.players[pid] = new HeosPlayer(this, player);
						// wait until objects are created before connecting, because states shouldn't be set before objects exist
						await heosPlayer.initMetaData(player);
						try {
							await heosPlayer.connect();
						} catch (err) {
							this.logDebug("can't connect error: " + err, false);
							this.logWarn("can't connect player " + player.name + ' (' + player.ip + '). Skip.', false);
							this.raiseFailures(player.ip, ERROR_CODES.General);
							playerConnected = false;
						}
					} else {
						this.players[pid].initMetaData(player);
					}
					if (playerConnected) {
						connectedPlayers.push(pid);
					}
				}
			}
			//Remove disconnected players && Update reboot times for not connected players
			let connectedPlayerIps = [];
			for (var pid in this.players) {
				if (!connectedPlayers.includes(pid)) {
					await this.stopPlayer(pid);
				} else {
					connectedPlayerIps.push(this.players[pid].ip);
				}
			}
			for(const ip in this.reboot_time){
				if(!connectedPlayerIps.includes(ip)){
					this.resetRebootTime(ip);
				}
			}

			//Check for players in fail state
			let playerInFailState = false;
			for (const id in this.ssdp_player_ips) {
				const ip = this.ssdp_player_ips[id];
				if (this.getUptime(ip) >= 5 && !foundPlayerIps.includes(ip)) {
					this.raiseLeaderFailures(this.ip);
					this.raiseFailures(ip, ERROR_CODES.General);
					this.logDebug('Connected Players: ' + JSON.stringify(foundPlayerIps) + ' | Announced Players: ' + JSON.stringify(this.ssdp_player_ips), true);
					this.logWarn('SSDP announced player ' + ip + ' not found by HEOS.');
					playerInFailState = true;
				}
			}
			if (playerInFailState) {
				this.reconnect();
			} else if (connectedPlayers.length == 0) {
				if (this.config.rebootOnFailure === true) {
					this.logWarn('Can\'t connect any players. Reboot.', true);
					this.rebootAll();
				} else {
					this.logWarn('Can\'t connect any players. Activate "reboot on failure" in the configuration or reboot manually.', true);
				}
			} else {
				this.getGroups();
				await this.updateKnownPlayerIPs();
			}
		} catch (err) {
			this.logError('[startPlayers] ' + err);
			this.raiseLeaderFailures(this.ip);
			this.reconnect();
		}
	}

	async updateKnownPlayerIPs() {
		const states = await this.getStatesAsync('players.*');
		this.known_player_ips = [];
		for (const id in states) {
			if (states[id] && states[id].val) {
				const idSplit = id.split('.');
				const state = idSplit[idSplit.length - 1];
				if (state == 'ip') {
					this.known_player_ips.push(states[id].val);
				}
			}
		}
	}

	updatePreferedPlayerIPs() {
		if (this.config.preferedIPs.length > 0) {
			const ips = this.config.preferedIPs.split(',').map(function (item) {
				return item.trim();
			});
			if (this.manual_search_mode) {
				if (this.prefered_player_ips.length == 0) {
					this.prefered_player_ips = ips;
				}
				this.next_connect_ip = this.prefered_player_ips[0];
				this.removePreferedPlayerIp(this.prefered_player_ips[0]);
			}
		} else {
			this.manual_search_mode = false;
		}
	}

	removePreferedPlayerIp(ip) {
		if (this.ip == ip && this.prefered_player_ips.includes(ip)) {
			const index = this.prefered_player_ips.indexOf(ip);
			if (this.prefered_player_ips.length == 1) {
				this.manual_search_mode = false;
			}
			if (index > -1) {
				this.prefered_player_ips.splice(index, 1);
			}
		}
	}

	//Alle Player stoppen
	async stopPlayers() {
		if (Object.keys(this.players).length) {
			this.logDebug('try to stop players:' + Object.keys(this.players).join(','));
		}
		for (const pid in this.players) {
			await this.stopPlayer(pid);
		}
	}

	getPlayers() {
		if (this.state == STATES.Connected) {
			this.queueMsg('player/get_players');
		}
	}

	// setzen der Werte einer Group
	async setGroup(group) {
		if (group.hasOwnProperty('pid')) {
			// in den Playern den Groupstatus setzen
			const pids = group.pid.split(',');

			for (let i = 0; i < pids.length; i++) {
				const pid = pids[i];
				const player = this.players[pid];
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
				this.executeCommand('group/get_volume?gid=' + group.gid);
				this.executeCommand('group/get_mute?gid=' + group.gid);
			}
		}
	}

	getGroups() {
		if (this.state == STATES.Connected) {
			// heos://group/get_groups
			this.queueMsg('group/get_groups');
		}
	}

	ungroupAll() {
		if (this.state == STATES.Connected) {
			for (const pid in this.players) {
				const player = this.players[pid];
				if (player && player.group_leader === true) {
					this.queueMsg('group/set_group?pid=' + pid);
				}
			}
		}
	}

	groupAll() {
		if (this.state == STATES.Connected) {
			const pids = Object.keys(this.players).join(',');
			this.queueMsg('group/set_group?pid=' + pids);
		}
	}

	getMusicSources() {
		if (this.state == STATES.Connected) {
			// heos://browse/get_music_sources
			this.queueMsg('browse/get_music_sources');
		}
	}

	signIn() {
		if (this.offline_mode || !this.config.username || !this.config.password) {
			this.logInfo('Skip sign in, because offline mode is activated or credentials missing.', false);
		} else if (this.state == STATES.Connected) {
			// heos://system/sign_in?un=heos_username&pw=heos_password
			this.queueMsg('system/sign_in?un=' + this.config.username + '&pw=' + this.config.password);
		}
	}

	signOut() {
		if (this.state == STATES.Connected) {
			// heos://system/sign_out
			this.queueMsg('system/sign_out');
		}
	}

	removeRebootIp(ip) {
		let removed = false;
		if (this.ip == ip && this.reboot_ips.includes(ip)) {
			const index = this.reboot_ips.indexOf(ip);
			if (index > -1) {
				this.reboot_ips.splice(index, 1);
				removed = true;
			}
		}
		return removed;
	}

	addRebootIp(ip) {
		if (ip && !this.reboot_ips.includes(ip)) {
			this.reboot_ips.push(ip);
			this.logDebug('add reboot ip ' + ip, true);
		}
	}

	reboot() {
		if (this.state == STATES.Connected || this.state == STATES.Reconnecting || this.state == STATES.Disconnecting) {
			this.logWarn('rebooting player ' + this.ip, true);

			this.logPlayerStatistics();

			this.raiseReboots(this.ip);

			// heos://system/reboot
			this.queueMsg('system/reboot');
			this.removeRebootIp(this.ip);
		}
		if (this.reboot_timeout) {
			clearTimeout(this.reboot_timeout);
			this.reboot_timeout = undefined;
		}
		this.reboot_timeout = setTimeout(() => {
			this.reconnect();
		}, 1000);
	}

	rebootAll() {
		this.logWarn('rebooting all players', false);
		this.reboot_ips = [];
		for (let i = 0; i < this.known_player_ips.length; i++) {
			this.addRebootIp(this.known_player_ips[i]);
		}
		this.reboot();
	}

	browseSource(sid) {
		if (this.state == STATES.Connected) {
			// heos://browse/browse?sid=source_id
			this.queueMsg('browse/browse?sid=' + sid);
		}
	}

	registerChangeEvents(b) {
		if (this.state == STATES.Connected || this.state == STATES.Reconnecting || this.state == STATES.Disconnecting) {
			if (b) {
				this.queueMsg('system/register_for_change_events?enable=on');
			} else {
				this.queueMsg('system/register_for_change_events?enable=off');
			}
		}
	}

	startHeartbeat() {
		if (this.state == STATES.Connected) {
			this.logDebug('[HEARTBEAT] start interval', false);
			this.heartbeat_interval = setInterval(() => {
				this.logDebug('[HEARTBEAT] ping', false);
				this.queueMsg('system/heart_beat');
				this.heartbeat_retries += 1;
				if (this.heartbeat_retries >= this.config.heartbeatRetries) {
					this.logWarn('[HEARTBEAT] retries exceeded', false);
					this.resetHeartbeatRetries(false);
					this.reconnect();
				}
				//Check Player Health
				for (const pid in this.players) {
					const player = this.players[pid];
					if (player) {
						player.checkHealth();
					}
				}
			}, this.config.heartbeatInterval);
		}
	}

	async resetHeartbeatRetries(pong) {
		if (pong) {
			this.logDebug('[HEARTBEAT] pong', false);
		} else {
			this.logDebug('[HEARTBEAT] reset retries', false);
		}
		this.heartbeat_retries = 0;
	}

	async stopHeartbeat() {
		this.logDebug('[HEARTBEAT] stop interval', false);
		if (this.heartbeat_interval) {
			clearInterval(this.heartbeat_interval);
			this.heartbeat_interval = undefined;
		}
		await this.resetHeartbeatRetries(false);
	}

	deleteRequestTime(msg) {
		for (const cmd in this.request_time) {
			if (msg.startsWith(cmd)) {
				delete this.request_time[cmd];
			}
		}
	}

	checkDuplicateRequest(msg) {
		let duplicate = false;
		const now = new Date();
		if (msg in this.request_time) { //Request Timeout
			if (Math.floor((now - this.request_time[msg]) / 1000) < this.config.requestTimeout) {
				duplicate = true;
				this.logDebug('Skip duplicate request: ' + msg);
			} else {
				this.logWarn('[checkDuplicateRequest] Response timed out: ' + msg + '. Increase leader failure counter.');
				this.raiseLeaderFailures(this.ip);
				this.deleteRequestTime(msg);
			}
		}
		this.logDebug('Request times: ' + JSON.stringify(this.request_time));
		return duplicate;
	}

	queueMsg(msg, ignore_duplicate_check = false) {
		if (ignore_duplicate_check || !this.checkDuplicateRequest(msg)) { //Request Timeout
			this.msgs.push(msg);
			this.sendNextMsg(ignore_duplicate_check);
		}
	}

	sendNextMsg(ignore_duplicate_check = false) {
		if (this.msgs.length > 0) {
			const msg = this.msgs.shift();
			if (ignore_duplicate_check || !this.checkDuplicateRequest(msg)) {
				this.sendMsg(msg);
			}
		}
	}

	// Nachricht an player senden
	sendMsg(msg) {
		const now = new Date();
		if (this.net_client) {
			try {
				this.net_client.write('heos://' + msg + '\n');
				if (!msg.startsWith('system/')) {
					this.request_time[msg] = now;
				}
			} catch (err) {
				this.logError('[sendMsg] ' + err, false);
				this.raiseLeaderFailures(this.ip);
				this.reconnect();
			}
			if (msg.includes('sign_in')) {
				this.logSilly('data sent: ' + msg, false);
				this.logDebug('data sent: sign_in - sensitive data hidden', false);
			} else {
				this.logDebug('data sent: ' + msg, false);
			}
		}
	}

	connect(ip) {
		this.state = STATES.Connecting;

		this.ip = ip;
		this.logInfo('connecting to HEOS (' + this.ip + ') ...', false);
		this.net_client = net.connect({ host: this.ip, port: 1255 });
		this.net_client.setKeepAlive(true, 60000);
		//this.net_client.setNoDelay(true);
		this.net_client.setTimeout(60000);

		if (this.next_connect_ip == ip) {
			this.next_connect_ip = '';
		}

		this.net_client.on('error', (error) => {
			this.logError('[connect] ' + error, false);
			if(!this.removeRebootIp(ip)){
				this.raiseLeaderFailures(this.ip);
			}
			this.reconnect();
		});

		// timeout
		this.net_client.on('timeout', () => {
			this.logWarn('timeout trying connect to ' + this.ip, false);
			if(!this.removeRebootIp(ip)){
				this.raiseLeaderFailures(this.ip);
			}
			this.reconnect();
		});

		this.net_client.on('connect', async () => {
			this.setStateChanged('info.connection', true, true);
			this.setStateChanged('connected_ip', this.ip, true);

			this.state = STATES.Connected;
			if (this.reboot_ips.includes(this.ip)) {
				this.reboot();
			} else {
				this.manual_search_mode = true;
				this.logInfo('connected to HEOS (' + this.ip + ')', true);
				this.getPlayers();
				this.registerChangeEvents(true);
				this.signIn();
				this.startHeartbeat();
			}
		});

		// Gegenseite hat die Verbindung geschlossen
		this.net_client.on('end', () => {
			this.logWarn('HEOS Player ' + this.ip + ' closed the connection.', false);
			this.reconnect();
		});

		// Datenempfang
		this.net_client.on('data', (data) => this.onData(data));
	}

	ssdpLeaderElection() {
		if (this.ssdp_search_timeout) {
			clearTimeout(this.ssdp_search_timeout);
			this.ssdp_search_timeout = undefined;
		}
		if (typeof this.net_client == 'undefined' && this.state == STATES.Searching) {
			this.ssdp_search_timeout = setTimeout(() => {
				if (this.state == STATES.Searching && this.ssdp_player_ips.length > 0) {
					let ip = this.getRandomArrayElement(this.ssdp_player_ips);
					const maxUptimeIps = this.ssdp_player_ips.filter(element => this.getMaxUptime().includes(element));
					const minFailureIps = this.ssdp_player_ips.filter(element => this.getMinFailures().includes(element));
					const minLeaderFailureIps = this.ssdp_player_ips.filter(element => this.getMinLeaderFailures().includes(element));
					if (maxUptimeIps.length > 0 || minFailureIps.length > 0 || minLeaderFailureIps.length > 0) {
						ip = this.getRandomArrayElement(maxUptimeIps.concat(minFailureIps, minLeaderFailureIps));
					}
					this.connect(ip);
				}
			}, this.config.searchTimeout);
		}
	}

	/** Verbindung zum HEOS System herstellen **/
	async search() {
		try {
			//Reset connect states
			this.setStateChanged('info.connection', false, true);
			this.setStateChanged('connected_ip', '', true);
			const list = await this.getChannelsAsync('players');
			if (list) {
				list.forEach(async(item) => {
					await this.setStateAsync(item._id + '.connected', false, true);
				});
			}
			this.state = STATES.Searching;

			//Update Player IPs
			await this.updateKnownPlayerIPs();
			this.updatePreferedPlayerIPs();
			if (this.reboot_ips.length == 0) {
				this.silent_log_mode = false;
			}
			if (this.reboot_ips.length > 0) {
				this.logDebug('following ips need to be rebooted: ' + this.reboot_ips.join(','), false);
				const ip = this.reboot_ips[0];
				this.logDebug('try to connect to ' + ip + ' to reboot device', false);
				this.connect(ip);
			} else if (this.next_connect_ip.length > 0) {
				this.logDebug('try to connect to ' + this.next_connect_ip, false);
				this.connect(this.next_connect_ip);
			} else {
				this.ssdp_retry_counter = 0;

				this.ssdp_player_ips = [];
				this.logInfo('searching for HEOS devices ...', true);
				this.nodessdp_client = new NodeSSDP({ 'sourcePort': this.config.sourcePort });
				this.nodessdp_client.explicitSocketBind = true;
				this.nodessdp_client.on('response', (headers, statusCode, rinfo) => this.onNodeSSDPResponse(headers, statusCode, rinfo));
				this.nodessdp_client.on('error', error => { this.nodessdp_client.close(); this.logError('[nodessdp] ' + error, false); });
				this.nodessdp_client.search(this.ssdp_search_target_name);
				this.ssdpLeaderElection();
				this.ssdp_search_interval = setInterval(() => {
					if (typeof this.net_client == 'undefined') {
						this.ssdp_retry_counter += 1;
					}
					this.ssdpLeaderElection();
					if (this.ssdp_retry_counter > 10 && this.known_player_ips.length > 0) {
						this.manual_search_mode = true;
						this.silent_log_mode = true;
						this.logWarn("can't find any HEOS devices. Try to connect known device IPs and reboot them to exclude device failure...", false);
						this.rebootAll();
					} else {
						this.logDebug('searching for HEOS devices ...', true);
						this.ssdp_player_ips = [];
						this.nodessdp_client.search(this.ssdp_search_target_name);
						this.getPlayers();
					}
				}, this.config.searchInterval);
			}
		} catch (err) { this.logError('[search] ' + err, false); }
	}

	logPlayerStatistics() {
		this.logDebug('reboot statistics: ' + JSON.stringify(this.reboot_counter));
		this.logDebug('reboot time: ' + JSON.stringify(this.reboot_time));
		this.logDebug('failure statistics: ' + JSON.stringify(this.failure_counter));
		this.logDebug('leader failure statistics: ' + JSON.stringify(this.leader_failure_counter));
		this.logDebug('min overall failure statistics: ' + JSON.stringify(this.getMinOverallFailures()));
		this.logDebug('max uptime statistics: ' + JSON.stringify(this.getMaxUptime()));
	}

	initPlayerStatistics(ip) {
		this.initReboots(ip);
		this.initFailures(ip);
		this.initLeaderFailures(ip);
	}

	getOverallFailures(ip) {
		let failures = 0;
		if (ip.length > 0) {
			failures += this.getReboots(ip);
			failures += this.getFailures(ip);
			failures += this.getLeaderFailures(ip);
		}
		return failures;
	}

	getMinOverallFailures() {
		let ips = [];
		let minFailures = 999;

		for (let i = 0; i < this.known_player_ips.length; i++) {
			const failures = this.getOverallFailures(this.known_player_ips[i]);
			if (failures < minFailures) {
				ips = [];
				ips.push(this.known_player_ips[i]);
				minFailures = failures;
			} else if (failures == minFailures) {
				ips.push(this.known_player_ips[i]);
			}
		}
		return ips.filter(n => n);
	}

	getUptime(ip) {
		let uptime = 0;
		const now = new Date();
		if (ip.length > 0 && ip in this.reboot_time) {
			uptime = Math.floor((now - this.reboot_time[ip]) / 1000 / 60); //Minutes
		}
		return uptime;
	}

	getMaxUptime() {
		let ips = [];
		let uptime = 0;

		for (const key in this.reboot_time) {
			if (this.getUptime(key) > uptime) {
				ips = [];
				ips.push(key);
				uptime = this.getUptime(key);
			} else if (this.getUptime(key) == uptime) {
				ips.push(key);
			}
		}
		return ips;
	}

	resetRebootTime(ip){
		if (ip.length > 0) {
			this.reboot_time[ip] = new Date();
		}
	}

	initReboots(ip) {
		if (ip.length > 0) {
			if (!(ip in this.reboot_counter)) {
				this.reboot_counter[ip] = 0;
			}
			if (!(ip in this.reboot_time)) {
				this.resetRebootTime(ip);
			}
		}
		this.logPlayerStatistics();
	}

	getReboots(ip) {
		if (ip.length > 0) {
			if (ip in this.reboot_counter) {
				return this.reboot_counter[ip];
			} else {
				return 0;
			}
		} else {
			return 0;
		}
	}

	raiseReboots(ip) {
		if (ip.length > 0) {
			if (ip in this.reboot_counter) {
				this.reboot_counter[ip] += 1;
			} else {
				this.reboot_counter[ip] = 1;
			}
			this.resetRebootTime(ip);
		}
		this.logPlayerStatistics();
	}

	reduceReboots(ip) {
		if (ip.length > 0) {
			if (ip in this.reboot_counter) {
				this.reboot_counter[ip] -= 1;
			} else {
				this.reboot_counter[ip] = 0;
			}
			if (ip in this.reboot_counter && this.reboot_counter[ip] < 0) {
				this.reboot_counter[ip] = 0;
			}
		}
		this.logPlayerStatistics();
	}

	clearReboots(ip) {
		if (ip.length > 0) {
			this.reboot_counter[ip] = 0;
		}
		this.logPlayerStatistics();
	}

	getMinReboots() {
		let ips = [];
		let reboots = 999;

		for (const key in this.reboot_counter) {
			if (this.getReboots(key) < reboots) {
				ips = [];
				ips.push(key);
				reboots = this.getReboots(key);
			} else if (this.getReboots(key) == reboots) {
				ips.push(key);
			}
		}
		return ips;
	}

	getMaxReboots() {
		let ips = [];
		let reboots = 0;

		for (const key in this.reboot_counter) {
			if (this.getReboots(key) > reboots) {
				ips = [];
				ips.push(key);
				reboots = this.getReboots(key);
			} else if (this.getReboots(key) == reboots) {
				ips.push(key);
			}
		}
		return ips;
	}

	initFailures(ip) {
		if (ip.length > 0) {
			if (!this.failure_counter[ip]) {
				this.failure_counter[ip] = {};
			}
			for (const code in ERROR_CODES) {
				if (!(ERROR_CODES[code] in this.failure_counter[ip])) {
					this.failure_counter[ip][ERROR_CODES[code]] = 0;
				}
			}
		}
		this.logPlayerStatistics();
	}

	getFailures(ip) {
		let failures = 0;
		if (ip.length > 0) {
			if (ip in this.failure_counter) {
				for (const code in ERROR_CODES) {
					failures += this.failure_counter[ip][ERROR_CODES[code]];
				}
				return failures;
			} else {
				return failures;
			}
		} else {
			return failures;
		}
	}

	getFailuresByCode(ip, code) {
		if (ip.length > 0) {
			if (!(ip in this.failure_counter)) {
				this.initFailures(ip);
			}
			if (ip in this.failure_counter && code in this.failure_counter[ip]) {
				return this.failure_counter[ip][code];
			} else {
				return 0;
			}
		} else {
			return 0;
		}
	}

	raiseFailures(ip, code) {
		if (ip.length > 0 && (this.state != STATES.Connected || this.getUptime(ip) >= 5)) {
			if (!(ip in this.failure_counter)) {
				this.initFailures(ip);
			}
			if (ip in this.failure_counter && code in this.failure_counter[ip]) {
				this.failure_counter[ip][code] += 1;
			}
		}
		this.logPlayerStatistics();
	}

	reduceFailures(ip, code) {
		if (ip.length > 0) {
			if (!(ip in this.failure_counter)) {
				this.initFailures(ip);
			}
			if (ip in this.failure_counter && code in this.failure_counter[ip]) {
				this.failure_counter[ip][code] -= 1;
			}
			if (ip in this.failure_counter && code in this.failure_counter[ip] && this.failure_counter[ip][code] < 0) {
				this.failure_counter[ip][code] = 0;
			}
		}
		this.logPlayerStatistics();
	}

	clearFailures(ip) {
		if (ip.length > 0) {
			this.failure_counter[ip] = {};
			this.initFailures(ip);
		}
		this.logPlayerStatistics();
	}

	clearFailuresByCode(ip, code) {
		if (ip.length > 0) {
			if (!(ip in this.failure_counter)) {
				this.initFailures(ip);
			}
			if (ip in this.failure_counter && code in this.failure_counter[ip]) {
				this.failure_counter[ip][code] = 0;
			}
		}
		this.logPlayerStatistics();
	}

	getMinFailures() {
		let ips = [];
		let failures = 999;

		for (const key in this.failure_counter) {
			if (this.getFailures(key) < failures) {
				ips = [];
				ips.push(key);
				failures = this.getFailures(key);
			} else if (this.getFailures(key) == failures) {
				ips.push(key);
			}
		}
		return ips;
	}

	getMaxFailures() {
		let ips = [];
		let failures = 0;

		for (const key in this.failure_counter) {
			if (this.getFailures(key) > failures) {
				ips = [];
				ips.push(key);
				failures = this.getFailures(key);
			} else if (this.getFailures(key) == failures) {
				ips.push(key);
			}
		}
		return ips;
	}

	initLeaderFailures(ip) {
		if (ip.length > 0 && !(ip in this.leader_failure_counter)) {
			this.leader_failure_counter[ip] = 0;
		}
		this.logPlayerStatistics();
	}

	getLeaderFailures(ip) {
		if (ip.length > 0) {
			if (ip in this.leader_failure_counter) {
				return this.leader_failure_counter[ip];
			} else {
				return 0;
			}
		} else {
			return 0;
		}
	}

	raiseLeaderFailures(ip) {
		if (ip.length > 0 && (this.state != STATES.Connected || this.getUptime(ip) >= 5)) {
			if (ip in this.leader_failure_counter) {
				this.leader_failure_counter[ip] += 1;
			} else {
				this.leader_failure_counter[ip] = 1;
			}
		}
		this.logPlayerStatistics();
	}

	reduceLeaderFailures(ip) {
		if (ip.length > 0) {
			if (ip in this.leader_failure_counter) {
				this.leader_failure_counter[ip] -= 1;
			} else {
				this.leader_failure_counter[ip] = 0;
			}
			if (ip in this.leader_failure_counter && this.leader_failure_counter[ip] < 0) {
				this.leader_failure_counter[ip] = 0;
			}
		}
		this.logPlayerStatistics();
	}

	clearLeaderFailures(ip) {
		if (ip.length > 0) {
			this.leader_failure_counter[ip] = 0;
		}
		this.logPlayerStatistics();
	}

	getMinLeaderFailures() {
		let ips = [];
		let failures = 999;

		for (const key in this.leader_failure_counter) {
			if (this.leader_failure_counter[key] < failures) {
				ips = [];
				ips.push(key);
				failures = this.leader_failure_counter[key];
			} else if (this.leader_failure_counter[key] == failures) {
				ips.push(key);
			}
		}
		return ips;
	}

	getMaxLeaderFailures() {
		let ips = [];
		let failures = 0;

		for (const key in this.leader_failure_counter) {
			if (this.leader_failure_counter[key] > failures) {
				ips = [];
				ips.push(key);
				failures = this.leader_failure_counter[key];
			} else if (this.leader_failure_counter[key] > failures) {
				ips.push(key);
			}
		}
		return ips;
	}

	mode(arr) {
		return arr.sort(function (a, b) {
			return arr.filter(function (v) { return v === a; }).length - arr.filter(function (v) { return v === b; }).length;
		}).pop();
	}

	getRandomArrayElement(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	async resetIntervals() {
		if (this.heartbeat_interval) {
			clearInterval(this.heartbeat_interval);
			this.heartbeat_interval = undefined;
		}
		if (this.ssdp_search_interval) {
			clearInterval(this.ssdp_search_interval);
			this.ssdp_search_interval = undefined;
		}
	}

	async resetTimeouts() {
		if (this.reconnect_timeout) {
			clearTimeout(this.reconnect_timeout);
			this.reconnect_timeout = undefined;
		}
		if (this.reboot_timeout) {
			clearTimeout(this.reboot_timeout);
			this.reboot_timeout = undefined;
		}
		if (this.ssdp_search_timeout) {
			clearTimeout(this.ssdp_search_timeout);
			this.ssdp_search_timeout = undefined;
		}
	}

	/** Alle Player stoppen und die TelNet Verbindung schließen **/
	async disconnect() {
		this.logInfo('disconnecting from HEOS ...', false);
		this.state = STATES.Disconnecting;

		await this.stopHeartbeat();
		await this.resetTimeouts();
		await this.resetIntervals();

		await this.stopPlayers();

		if (typeof this.net_client !== 'undefined') {
			try {
				this.registerChangeEvents(false);
				this.net_client.destroy();
				this.net_client.unref();
			}catch(e){}
			this.net_client = undefined;
		}
		if (typeof this.nodessdp_client !== 'undefined') {
			try {
				this.nodessdp_client.stop();
			}catch(e){}
			this.nodessdp_client = undefined;
		}
		await this.setStateAsync('error', false, true);
		await this.setStateAsync('last_error', '', true);
		await this.setState('signed_in', false, true);
		await this.setState('signed_in_user', '', true);

		const list = await this.getChannelsAsync('players');
		if (list) {
			list.forEach(async(item) => {
				await this.setStateAsync(item._id + '.connected', false, true);
			});
		}
		this.resetVars(false);

		await this.setStateChangedAsync('info.connection', false, true);
		await this.setStateChangedAsync('connected_ip', '', true);
		this.logInfo('disconnected from HEOS', false);
	}

	async reconnect() {
		if (this.state == STATES.Reconnecting || this.state == STATES.Disconnecting) return;

		this.logInfo('reconnecting to HEOS ...', false);

		await this.disconnect();

		this.state = STATES.Reconnecting;
		if (this.reconnect_timeout) {
			clearTimeout(this.reconnect_timeout);
			this.reconnect_timeout = undefined;
		}
		this.reconnect_timeout = setTimeout(() => {
			this.search();
		}, this.config.reconnectTimeout);
	}

	main() {
		this.search();
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