var moment = require(`moment-timezone`);
var fs = require(`fs`);

function getTime() {
    return moment().tz('America/Los_Angeles').format('MM/DD/YYYY h:mm:ss A');
}

module.exports = (msg) => {
    console.log(`[${getTime()}]\n${msg}\n\n`);
    fs.appendFileSync(`logs.txt`, `[${getTime()}]\n${msg}\n\n`);
};