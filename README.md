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

## Configuration

* "AutoPlay": Automatically plays music after the player is connected or on unmute. Can be configured globally in configuration. If it is enabled globally you can disable it for one specific player with the state auto_play
* "ignore_broadcast_cmd": This player state configures, if the player should ignore commands to all players e.g. player/set_mute&state=on or pressing the play button for presets/playlists 

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
* "add_to_queue&sid=1025&aid=4&cid=[CID]": Play playlist with [CID] on player (aid: 1 – play now; 2 – play next; 3 – add to end; 4 – replace and play)

## Browse Sources
To reduce the state amount in ioBroker, only playlists and the presets are automatically stored in the states. However at first you have to click the browse button in the playlists or presets folder. You can find and control them in the "sources" folder. If you want to browse the music of a source, just press the browse button. You'll find the browse result in the sources.browse_result state. There are also commands provided to navigate deeper or play a resource. Just paste the commands in the global HEOS command field. If it is a browse command you'll find the result in the browse_result state.

For VIS integration you can use the browse_result and the following script to generate a html table (It is not integrated in the adapter, so that you have the chance to style it):

```javascript
on({id: 'heos.0.sources.browse_result', change: 'any'}, function (obj) {
    let data = JSON.parse(obj.state.val);
    let html = ""
    if(data){
        html += "<div style=\"background-color:#3b3b3b;color:#fff\"><h1><img src=\"" + data.image_url + "\" height=\"30px\">" + data.name + "</h1>"
        html += "<table>"
        for (let i = 0; i < data.payload.length; i++) {
            let payload = data.payload[i];
            html += "<tr>";
            html += "<td><img src=\"" + payload.image_url + "\" height=\"30px\"></td>";
            html += "<td>" + payload.name + "</td>";
            html += "<td>";
            for (let key in payload.commands) {
                let command = payload.commands[key];
                html += "<button class=\"ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only\" onClick=\"servConn.setState('heos.0.command','" + command +"')\"><span class=\"ui-button-text\">" + key + "</span></button>";
            }
            html += "</td>";
            html += "</tr>";
        }
        html += "</table></div>";
    }
    setState("0_userdata.0.scriptData.HeosBrowseTable", html);
});
```

## Changelog

### 1.2.4 (2020-09-29)
* (withstu) minor bugfix

### 1.2.3 (2020-09-29)
* (withstu) improve browse feature (add pictures and sources view)

### 1.2.2 (2020-09-28)
* (withstu) rename browse command

### 1.2.1 (2020-09-28)
* (withstu) introduce browse_result state

### 1.2.0 (2020-09-27)
* (withstu) Breaking change: restructure playlists/presets (you should delete the devices playlists, presets and sources before installation)

### 1.1.2 (2020-09-26)
* (withstu) log browse parameters

### 1.1.1 (2020-09-26)
* (withstu) add source browse feature (Click the button in the sources. You can find the possible next commands in the log.)

### 1.1.0 (2020-09-26)
* (withstu) encrypt password

### 1.0.1 (2020-09-21)
* (withstu) remove connected state, because it is included in the info channel

### 1.0.0 (2020-09-21)
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