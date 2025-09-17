const path = require("path");
const rootdir = path.resolve(__dirname + "/../");

exports.ROOTDIR = rootdir;
exports.LIBDIR = path.normalize(rootdir + "/lib");
exports.CONFDIR = path.normalize(rootdir + "/conf");
exports.LOGDIR = path.normalize(rootdir + "/logs");
exports.LOGSCONF = rootdir + "/conf/log.json";
exports.CLUSTERCONF = rootdir + "/conf/cluster.json";
exports.LOGNAME = rootdir + "/logs/load-balancer.log.ndjson";

exports.MAX_LOG = 1024;

exports.DEFAULT_HEALTHCHECKINTERVAL = 60000;
