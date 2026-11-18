const STATES = {
    Disconnecting: 0,
    Disconnected: 1,
    Searching: 2,
    Reconnecting: 3,
    Connecting: 4,
    Connected: 5,
};

const ERROR_CODES = {
    General: 0,
    PlaybackError: 1,
    Timeout: 2,
    Upnp: 3,
};

// HEOS needs some time to discover all players after waking up, so incomplete
// get_players answers are tolerated for a while and asked again
const INCOMPLETE_PLAYERS_RETRY_MS = 10000;
const INCOMPLETE_PLAYERS_TOLERANCE_MS = 60000;

export { STATES, ERROR_CODES, INCOMPLETE_PLAYERS_RETRY_MS, INCOMPLETE_PLAYERS_TOLERANCE_MS };
