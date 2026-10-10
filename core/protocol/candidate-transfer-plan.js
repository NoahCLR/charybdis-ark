"use strict";
const {decodeProfileBlob, PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {PROFILE_CANDIDATE_V1} = require("./profile-candidate-v1");

// Reuse is a transport choice. The complete reconstructed candidate still
// passes the firmware's checksum and semantic validators before any commit.
// Align domains by identity so resizing one does not upload every later one.
function candidateTransferPlan(value, baseValue) {
    const target = Buffer.from(value);
    const parsed = decodeProfileBlob(target);
    if (!baseValue) return [{kind: "write", offset: 0, length: target.length}];
    const base = Buffer.from(baseValue), previous = decodeProfileBlob(base);
    const ranges = [];
    const append = (kind, offset, length, sourceOffset = 0) => {
        if (!length) return;
        const last = ranges.at(-1);
        if (last?.kind === kind && last.offset + last.length === offset
            && (kind === "write" || last.sourceOffset + last.length === sourceOffset)) last.length += length;
        else ranges.push(kind === "reuse" ? {kind, offset, sourceOffset, length} : {kind, offset, length});
    };
    const compare = (offset, length, sourceOffset, sourceLength) => {
        const a = target.subarray(offset, offset + length), b = base.subarray(sourceOffset, sourceOffset + sourceLength);
        let prefix = 0, suffix = 0;
        while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix++;
        while (suffix < Math.min(a.length, b.length) - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
        append("reuse", offset, prefix, sourceOffset);
        // Equal-sized domains can contain several separated scalar changes.
        if (length === sourceLength) {
            let at = prefix;
            while (at < length - suffix) {
                const equal = a[at] === b[at], start = at++;
                while (at < length - suffix && (a[at] === b[at]) === equal) at++;
                append(equal ? "reuse" : "write", offset + start, at - start, sourceOffset + start);
            }
        } else append("write", offset + prefix, length - prefix - suffix);
        append("reuse", offset + length - suffix, suffix, sourceOffset + sourceLength - suffix);
    };
    compare(0, PROFILE_BLOB_V1.HEADER_SIZE, 0, PROFILE_BLOB_V1.HEADER_SIZE);
    const sources = new Map();
    let sourceOffset = PROFILE_BLOB_V1.HEADER_SIZE;
    for (const domain of previous.domains) {
        const length = PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + domain.payload.length;
        sources.set(domain.id, {offset: sourceOffset, length}); sourceOffset += length;
    }
    let offset = PROFILE_BLOB_V1.HEADER_SIZE;
    for (const domain of parsed.domains) {
        const length = PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + domain.payload.length, source = sources.get(domain.id);
        if (source) compare(offset, length, source.offset, source.length);
        else append("write", offset, length);
        offset += length;
    }
    // Short equal runs cost more to describe than to send. Coalesce them
    // into neighbouring writes; split large copies to bound cancellation.
    const selected = [];
    for (const range of ranges) {
        if (range.kind === "reuse" && range.length >= 80) {
            for (let inner = 0; inner < range.length; inner += PROFILE_CANDIDATE_V1.REUSE_MAX) {
                selected.push({...range, offset: range.offset + inner, sourceOffset: range.sourceOffset + inner,
                    length: Math.min(PROFILE_CANDIDATE_V1.REUSE_MAX, range.length - inner)});
            }
        } else {
            const last = selected.at(-1);
            if (last?.kind === "write") last.length += range.length;
            else selected.push({kind: "write", offset: range.offset, length: range.length});
        }
    }
    return selected;
}
module.exports = {candidateTransferPlan};
