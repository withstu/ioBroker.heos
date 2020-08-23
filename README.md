![Logo](admin/heos.png)
# ioBroker.heos

[![NPM version](http://img.shields.io/npm/v/iobroker.heos.svg)](https://www.npmjs.com/package/iobroker.heos)
[![Downloads](https://img.shields.io/npm/dm/iobroker.heos.svg)](https://www.npmjs.com/package/iobroker.heos)
![Number of Installations (latest)](http://iobroker.live/badges/heos-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/heos-stable.svg)
[![Dependency Status](https://img.shields.io/david/withstu/iobroker.heos.svg)](https://david-dm.org/withstu/iobroker.heos)
[![Known Vulnerabilities](https://snyk.io/test/github/withstu/ioBroker.heos/badge.svg)](https://snyk.io/test/github/withstu/ioBroker.heos)

[![NPM](https://nodei.co/npm/iobroker.heos.png?downloads=true)](https://nodei.co/npm/iobroker.heos/)

## heos adapter for ioBroker

The adapter lets control HEOS from ioBroker

## Command

HEOS CLI specification: http://rn.dmglobal.com/euheos/HEOS_CLI_ProtocolSpecification.pdf

### HEOS Command State

* "connect": Try to Connect to HEOS
* "disconnect": Disconnect from HEOS
* "reconnect": Disconnect and Connect
* "load_sources": Reload sources
* "group/set_group?pid=<pid1>,<pid2>,...": Set group with the list of player ids e.g. "group/set_group?pid=12345678,12345679".
* "group/set_group?pid=<pid1>" : Delete existing group e.g. "group/set_group?pid=12345678"
* "group/ungroup_all" : Delete all groups
* "group/group_all" : Group all player in one group
* "player/[cmd]": Send the command to all players. e.g. player/set_mute&state=on 
* "...": All other commands are tried to send to HEOS

### Player Command State

Note: Multiple commands are possible, if they are separated with the pipe e.g. set_volume&level=20|play_preset&preset=1

* "set_volume&level=0|1|..|100": Set the player volume 
* "set_play_state&state=play|pause|stop": Set the player state
* "set_play_mode&repeat=on_all|on_one|off&shuffle=on|off": Set Repeat and Shuffle mode
* "set_mute&state=on|off": Mute player
* "volume_down&step=1..10": Lower volume   
* "volume_up&step=1..10": Raise volume
* "play_next": Play next
* "play_previous": Play previous
* "play_preset&preset=1|2|..|n": Play preset n
* "play_stream&url=url_path": Play URL-Stream

## Changelog

### 0.0.1
* (withstu) initial release

## License
MIT License

Copyright (c) 2020 withstu <withstu@gmx.de>

derived from https://forum.iobroker.net/topic/10420/vorlage-denon-heos-script by Uwe Uhula

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.