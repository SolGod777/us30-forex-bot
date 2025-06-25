"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenAllPositions = flattenAllPositions;
exports.shouldFlattenNow = shouldFlattenNow;
const FLAT_BEFORE_UTC_HOUR = 21;
const FLAT_BEFORE_UTC_MINUTE = 55;
async function flattenAllPositions(connection, symbol = "US30") {
    const positions = await connection.getPositions();
    const us30Positions = positions.filter((p) => p.symbol === symbol);
    if (us30Positions.length === 0) {
        console.log("No positions to flatten.");
        return;
    }
    for (const pos of us30Positions) {
        console.log(`Closing ${pos.type} position at ${pos.openPrice}`);
        await connection.closePosition(pos.id.toString(), {});
    }
}
function shouldFlattenNow() {
    const now = new Date();
    return (now.getUTCHours() === FLAT_BEFORE_UTC_HOUR &&
        now.getUTCMinutes() === FLAT_BEFORE_UTC_MINUTE);
}
