# Older changes
## 3.0.2 (2025-11-03)
* (withstu) fix tests

## 3.0.1 (2025-11-03)
* (withstu) update vscode settings
* (withstu) shift from commonjs to esm
* (withstu) update packages

## 3.0.0 (2025-10-28)
* (withstu) improve group state updates
* (withstu) upgrade several packages

## 2.2.4 (2024-10-31)
* (withstu) improve tidal connect workaround

## 2.2.3 (2024-10-30)
* (withstu) fix audio format

## 2.2.2 (2024-10-30)
* (withstu) add workaround for tidal connect sid = 0 bug and fix audio format
* (withstu) increase minimum node.js version to recommended version 18
* (withstu) project maintenance

## 2.2.1 (2024-01-14)
* (withstu) add workaround for node 19+ ECONNRESET bug #299

## 2.2.0 (2024-01-06)
* (withstu) update dependencies
* (withstu) add admin 5 UI support
* (withstu) improve preferred IP handling
* (withstu) improve undefined station handling #299
* (withstu) reduce upnp requests

## 2.1.0 (2023-08-05)
* (withstu) replace got with axios
* (withstu) improve upnp handling
* (withstu) prevent duplicate connect messages

## 2.0.0 (2023-08-05)
* (withstu) fix pipelines and remove node 14.x support

## 1.12.3 (2023-08-05)
* (withstu) update dependencies

## 1.12.2 (2023-05-13)
* (withstu) optimize error handling

## 1.12.1 (2023-02-26)
* (withstu) optimize leader election

## 1.12.0 (2023-02-25)
* (withstu) optimize scope handling
* (withstu) switch to HEOS default cmd delimiter
* (withstu) add configuration to prefer list of IPs for adapter connection
* (withstu) optimize error handling

## 1.11.4 (2022-11-04)
* (withstu) improve play all button in browse feature

## 1.11.3 (2022-11-04)
* (withstu) update some dependencies
* (withstu) improve failure handling
* (withstu) improve play all button in browse feature

## 1.11.2 (2022-10-16)
* (withstu) adopt to new adapter structure

## 1.11.1 (2022-10-16)
* (withstu) fix release

## 1.11.0 (2022-10-16)
* (withstu) improve player failure detection
* (withstu) fix bug in regex mute
* (withstu) fix upnp NaN warning #192

## 1.10.0 (2022-06-16)
* (foxriver76) fix default value of `sid` (closes #174)

## 1.9.2 (2022-01-22)
* (withstu) add volume lock

## 1.9.1 (2021-08-17)
* (withstu) fix type issues
* (withstu) fix roles and repeat state

## 1.9.0 (2021-07-27)
* (stephanritscher) add option to configure udp source port

## 1.8.6 (2021-06-13)
* (withstu) test fixed pipeline

## 1.8.4 (2021-06-13)
* (withstu) improve stability

## 1.8.3 (2021-05-13)
* (withstu) fix upnp values on failure

## 1.8.2 (2021-05-12)
* (withstu) BREAKING: add queue paging
* (withstu) BREAKING: volume_max -> volume_limit
* (foxriver76) Fix type issues and some more minor changes

## 1.8.1 (2021-05-07)
* (withstu) fix reboot loop

## 1.8.0 (2021-04-24)
* (withstu) add reboot on failure configuration

## 1.7.9 (2021-04-07)
* (withstu) fix reboot
* (withstu) add power state

## 1.7.8 (2021-04-05)
* (withstu) add reboot

## 1.7.7 (2021-02-25)
* (withstu) add creation of missing version state

## 1.7.6 (2021-02-24)
* (withstu) add image color extraction

## 1.7.5 (2021-02-12)
* (withstu) add bit depth

## 1.7.4 (2021-02-01)
* (withstu) fix upnp init bug

## 1.7.3 (2021-02-01)
* (withstu) add upnp module and support bitrate, audio format and sample rate

## 1.7.2 (2021-01-30)
* (withstu) fix seek in groups

## 1.7.1 (2021-01-30)
* (withstu) add seek

## 1.7.0 (2021-01-29)
* (withstu) reboot not responding players
* (withstu) delete old presets and playlists

## 1.6.2 (2021-01-02)
* (withstu) fix "user not logged in" handling

## 1.6.1 (2020-11-25)
* (withstu) clear timeout and interval on unload; fix roles; remove sleep in tts module

## 1.6.0 (2020-11-22)
* (withstu) add regex mute

## 1.5.6 (2020-11-22)
* (withstu) add source images & optimize auto play

## 1.5.5 (2020-11-01)
* (withstu) update some packages and add sources event

## 1.5.4 (2020-10-24)
* (withstu) ignore invalid now playing responses

## 1.5.3 (2020-10-18)
* (withstu) minor improvements related to auto play feature

## 1.5.2 (2020-10-11)
* (withstu) improve tts stop method

## 1.5.1 (2020-10-11)
* (withstu) improve tts and don't update queue during tts

## 1.5.0 (2020-10-10)
* (withstu) add tts support and maximum volume

## 1.4.0 (2020-10-10)
* (withstu) add more play and queue settings
* (withstu) bugfixing for invalid heos responses (empty player name)

## 1.3.4 (2020-10-04)
* (withstu) remove sorting and available filter and fix browse play

## 1.3.3 (2020-10-04)
* (withstu) fix previous page button in browse feature

## 1.3.2 (2020-10-04)
* (withstu) fix preset sorting

## 1.3.1 (2020-10-03)
* (withstu) add back button to browse feature

## 1.3.0 (2020-10-03)
* (withstu) add queue and some browse improvements

## 1.2.4 (2020-09-29)
* (withstu) minor bugfix

## 1.2.3 (2020-09-29)
* (withstu) improve browse feature (add pictures and sources view)

## 1.2.2 (2020-09-28)
* (withstu) rename browse command

## 1.2.1 (2020-09-28)
* (withstu) introduce browse_result state

## 1.2.0 (2020-09-27)
* (withstu) Breaking change: restructure playlists/presets (you should delete the devices playlists, presets and sources before installation)

## 1.1.2 (2020-09-26)
* (withstu) log browse parameters

## 1.1.1 (2020-09-26)
* (withstu) add source browse feature (Click the button in the sources. You can find the possible next commands in the log.)

## 1.1.0 (2020-09-26)
* (withstu) encrypt password

## 1.0.1 (2020-09-21)
* (withstu) remove connected state, because it is included in the info channel

## 1.0.0 (2020-09-21)
* (withstu) initial release
