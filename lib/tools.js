/**
 * Tests whether the given variable is a real object and not an Array
 *
 * @param {any} it The variable to test
 * @returns {it is Record<string, any>} return
 */
function isObject(it) {
    // This is necessary because:
    // typeof null === 'object'
    // typeof [] === 'object'
    // [] instanceof Object === true
    return Object.prototype.toString.call(it) === '[object Object]';
}

/**
 * Tests whether the given object is an object and key is in object
 *
 * @param {any} key The key to test
 * @param {any} object The object to search key in
 * @returns {it is Record<string, any>} return
 */
function keyInObject(key, object) {
    return isObject(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Tests whether the given variable is really an Array
 *
 * @param {any} it The variable to test
 * @returns {it is any[]} return
 */
function isArray(it) {
    if (typeof Array.isArray === 'function') {
        return Array.isArray(it);
    }
    return Object.prototype.toString.call(it) === '[object Array]';
}

export { isArray, isObject, keyInObject };
