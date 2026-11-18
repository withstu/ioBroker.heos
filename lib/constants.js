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

// A player connect that has not settled by then counts as failed, so it cannot block startPlayers
const PLAYER_CONNECT_TIMEOUT_MS = 45000;

// New players connect this far apart: one slow player must not hold up the others, but their
// start commands share the single Telnet connection and HEOS rejects bursts
const PLAYER_CONNECT_STAGGER_MS = 300;

export {
    STATES,
    ERROR_CODES,
    INCOMPLETE_PLAYERS_RETRY_MS,
    INCOMPLETE_PLAYERS_TOLERANCE_MS,
    PLAYER_CONNECT_TIMEOUT_MS,
    PLAYER_CONNECT_STAGGER_MS,
};
