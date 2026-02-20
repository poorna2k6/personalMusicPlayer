const fs = require('fs');
const path = require('path');

const MAIN_VERSION = '3.3';

function getSuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

function formatDateToVersion(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = months[date.getMonth()];
    const day = date.getDate();
    const suffix = getSuffix(day);

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';

    hours = hours % 12;
    hours = hours ? hours : 12;

    const formattedDate = `${monthStr} ${day}${suffix} ${hours}:${minutes} ${ampm}`;

    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const subversion = `${MM}${DD}${HH}${mm}`;

    return `${MAIN_VERSION}_${subversion}`;
}

const now = new Date();
const fullVersion = formatDateToVersion(now);

const versionData = {
    version: fullVersion,
    timestamp: now.toISOString()
};

const filePath = path.join(__dirname, '../docs/version.json');
fs.writeFileSync(filePath, JSON.stringify(versionData, null, 2));

console.log(`Updated version to ${fullVersion}`);
