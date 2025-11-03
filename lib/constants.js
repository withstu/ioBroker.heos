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

export { STATES, ERROR_CODES };
