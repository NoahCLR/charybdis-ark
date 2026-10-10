"use strict";
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");
async function readHostOs(connection, ids) {
    const request = buildProfileGetRequest(0x0b, 0, ids.next());
    const response = await connection.request(request, {matchResponse: profileResponseMatcher});
    const bytes = Buffer.from(decodeProfileResponse(response, request, {allowShortPayload: true}));
    if (bytes.length !== 2 || bytes[0] !== 1 || bytes[1] > 3) throw Object.assign(new Error("Invalid host OS readback. Read the keyboard again."), {code: "INVALID_HOST_OS"});
    return {detected: bytes[1]};
}
module.exports = {readHostOs};
