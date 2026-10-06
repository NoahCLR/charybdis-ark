"use strict";
// The web host's clock: a dedicated worker that answers each request after
// the time it asks for. Chrome throttles the timers of a page in a background
// tab — a 20 ms poll becomes a second or more, which would stretch an Apply
// many times over — but not a dedicated worker's, and the worker's answer
// reaches the page as a message, which is not throttled either.
self.onmessage = (event) => {
    const {id, ms} = event.data;
    setTimeout(() => self.postMessage(id), ms);
};
