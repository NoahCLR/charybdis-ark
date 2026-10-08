"use strict";

// Browser-native File/DataTransfer values, as an operating-system file drop
// delivers them. The panel still reads the File and posts through its host.
async function dropFiles(page, files, selector = "[data-profile-drop]") {
    return page.evaluate(({files, selector}) => {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(new File([file.text], file.name, {type: file.type ?? "application/json"}));
        const target = document.querySelector(selector);
        const event = new DragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: transfer});
        target.dispatchEvent(event);
        return event.defaultPrevented;
    }, {files, selector});
}

module.exports = {dropFiles};
