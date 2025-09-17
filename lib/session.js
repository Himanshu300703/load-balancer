// Simple sticky session handler using in-memory map
const sessionMap = new Map();

function getClientHash(ip) {
    return ip.split('.').reduce((acc, val) => acc + parseInt(val), 0);
}

function setStickySession(ip, backendList) {
    const hash = getClientHash(ip);
    const index = hash % backendList.length;
    sessionMap.set(ip, index);
    return backendList[index];
}

function getStickySession(ip, backendList) {
    if (sessionMap.has(ip)) {
        const index = sessionMap.get(ip);
        return backendList[index % backendList.length];
    }
    return setStickySession(ip, backendList);
}

function getBackendIndex(clientIP, backendList) {
    return getStickySession(clientIP, backendList);
}

module.exports = {
    getBackendIndex,
    setStickySession,
    getStickySession
};
