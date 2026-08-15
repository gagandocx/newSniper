// Content script (ISOLATED world) — reads data from the MAIN world interceptor
// This runs when the popup calls chrome.scripting.executeScript

// Trigger the MAIN world to dump data into DOM
document.dispatchEvent(new CustomEvent('__pullRecorderData'));

// Wait a moment for it to write, then read
setTimeout(function() {
    var el = document.getElementById('__rec_json');
    if (el && el.getAttribute('data-ready') === 'true') {
        // Post data back via DOM for popup to read
        var result = el.value;
        document.title = '__RECORDER__' + result;
    }
}, 200);
