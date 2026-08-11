document['addEventListener']('DOMContentLoaded', async function () {
    const a = await new Promise(A => chrome['management']['getSelf'](B => A(B['version'])));
    document['getElementById']('version')['innerText'] = '(version\x20v' + a + ')';
    const b = {
            'Any City': {
                'lat': 43.653524,
                'lng': -79.383907
            },
            'Entire BC': {
                'lat': 49.19,
                'lng': -122.85
            },
            'Acheson': {
                'lat': 53.548701,
                'lng': -113.76261
            },
            'Ajax': {
                'lat': 43.850814,
                'lng': -79.020296
            },
            'Balzac': {
                'lat': 51.212985,
                'lng': -114.007862
            },
            'Bolton': {
                'lat': 43.875473,
                'lng': -79.734437
            },
            'Brampton': {
                'lat': 43.685271,
                'lng': -79.759924
            },
            'Calgary': {
                'lat': 51.045113,
                'lng': -114.057141
            },
            'Cambridge': {
                'lat': 43.361621,
                'lng': -80.314429
            },
            'Concord': {
                'lat': 43.80011,
                'lng': -79.48291
            },
            'Dartmouth': {
                'lat': 44.67134,
                'lng': -63.57719
            },
            'Edmonton': {
                'lat': 53.54545,
                'lng': -113.49014
            },
            'Etobicoke': {
                'lat': 43.65421,
                'lng': -79.56711
            },
            'Hamilton': {
                'lat': 43.25549,
                'lng': -79.873376
            },
            'Mississauga': {
                'lat': 43.58882,
                'lng': -79.644378
            },
            'Nisku': {
                'lat': 53.337845,
                'lng': -113.531304
            },
            'Ottawa': {
                'lat': 45.425226,
                'lng': -75.699963
            },
            'Rocky\x20View': {
                'lat': 51.18341,
                'lng': -113.93527
            },
            'Scarborough': {
                'lat': 43.773077,
                'lng': -79.257774
            },
            'Sidney': {
                'lat': 48.650629,
                'lng': -123.398604
            },
            'ST.\x20Thomas': {
                'lat': 42.777414,
                'lng': -81.182973
            },
            'Stoney\x20Creek': {
                'lat': 43.21681,
                'lng': -79.76633
            },
            'Toronto': {
                'lat': 43.653524,
                'lng': -79.383907
            },
            'Vancouver': {
                'lat': 49.261636,
                'lng': -123.11335
            },
            'Vaughan': {
                'lat': 43.849270138,
                'lng': -79.535136594
            },
            'Whitby': {
                'lat': 43.897858,
                'lng': -78.943434
            },
            'Windsor': {
                'lat': 42.317438,
                'lng': -83.035225
            },
            'Belgrade': {
                'lat': 45.776196,
                'lng': -111.177155
            }
        }, c = [
            'Bolton',
            'Brampton',
            'Burnaby',
            'Cambridge',
            'Concord',
            'Toronto',
            'Sidney',
            'Belgrade'
        ], d = await chrome['storage']['local']['get']([
            'selectedCity',
            'distance',
            'jobType',
            '__ap',
            'cityTags',
            'fetchIntervalValue',
            'fetchIntervalUnit'
        ]), e = d['selectedCity'] || 'Toronto', f = d['distance'] || '50', g = d['jobType'] || 'Any', h = d['__ap'] || ![], i = d['cityTags'] || [], j = d['fetchIntervalValue'] || '2', k = d['fetchIntervalUnit'] || 's';
    await chrome['storage']['local']['get']()['then'](A => {
        const B = document['getElementById']('activate');
        if (B) {
            B['checked'] = A['__ap'];
            const _pc = document['getElementById']('power-card');
            if (_pc) _pc['classList']['toggle']('active', !!A['__ap']);
        } else { console['error']('activate element not found'); }
    });
    if (i['length'] === 0x0)
        chrome['storage']['local']['set']({ 'cityTags': c }, function () {
        });
    else {
    }
    const l = document['getElementById']('city'), m = document['getElementById']('distance'), n = document['getElementById']('work_hours'), o = document['getElementById']('activate'), p = document['getElementById']('fetch_interval_value'), q = document['getElementById']('fetch_interval_unit');
    if (l)
        l['value'] = e;
    if (m)
        m['value'] = f;
    if (n)
        n['value'] = g;
    if (o)
        o['checked'] = h;
    if (p)
        p['value'] = j;
    if (q)
        q['value'] = k;
    const {
        lat: r,
        lng: s
    } = b[e];
    chrome['storage']['local']['set']({
        'lat': r,
        'lng': s
    }), document['getElementById']('city')['addEventListener']('change', function () {
        const A = this['value'];
        if (A === 'Any City') {
            chrome['storage']['local']['get']('cityTags', function (tags) {
                const B = tags['cityTags'] || [];
                if (!B['some'](D => D['toLowerCase']() === 'any city')) {
                    document['getElementById']('any-city-btn')['click']();
                }
            });
            const distElem = document['getElementById']('distance');
            if (distElem) {
                distElem['value'] = '25000';
                distElem['dispatchEvent'](new Event('change'));
            }
        }
        // ── ENTIRE BC: Pre-fill target cities with Lower Mainland cities ──
        if (A === 'Entire BC') {
            var _bcCities = ['Surrey', 'Richmond', 'Delta', 'Tsawwassen', 'Pitt Meadows', 'Coquitlam', 'Langley', 'Burnaby', 'New Westminster', 'Vancouver', 'Sidney'];
            chrome['storage']['local']['set']({ 'cityTags': _bcCities });
            // Set distance to 150km to cover all Lower Mainland + Fraser Valley
            const distElem = document['getElementById']('distance');
            if (distElem) {
                distElem['value'] = '150';
                distElem['dispatchEvent'](new Event('change'));
            }
            // Refresh the tag display in the popup
            var _tagBox = document['getElementById']('tag-input-box');
            if (_tagBox) {
                // Remove existing tags
                var _existingTags = _tagBox['querySelectorAll']('.tag');
                _existingTags.forEach(function(tag) { tag.remove(); });
                // Add BC city tags
                _bcCities.forEach(function(city) {
                    t(city, true);
                });
            }
            // Show clear button
            var _clearBtn = document['getElementById']('clear-all');
            if (_clearBtn) _clearBtn['style']['display'] = 'inline';
        }
        // ─────────────────────────────────────────────────────────────────
        const {
                lat: B,
                lng: C
            } = b[A];
        chrome['storage']['local']['set']({
            'selectedCity': A,
            'lat': B,
            'lng': C
        });
    }), document['getElementById']('distance')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'distance': A });
    }), document['getElementById']('work_hours')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'jobType': A });
    }), document['getElementById']('fetch_interval_value')['addEventListener']('change', function () {
        const A = this['value'];
        if (A && parseFloat(A) >= 0.1) chrome['storage']['local']['set']({ 'fetchIntervalValue': A });
    }), document['getElementById']('fetch_interval_value')['addEventListener']('input', function () {
        const A = this['value'];
        if (A && parseFloat(A) >= 0.1) chrome['storage']['local']['set']({ 'fetchIntervalValue': A });
    }), document['getElementById']('fetch_interval_unit')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'fetchIntervalUnit': A });
    }), (function() {
        // Groq API Key save/load
        chrome['storage']['local']['get'](['groq_api_key'], function (A) {
            const el = document['getElementById']('groq_api_key');
            if (el && A['groq_api_key']) el['value'] = A['groq_api_key'];
        });
        const _gk = document['getElementById']('groq_api_key');
        if (_gk) {
            _gk['addEventListener']('input', function () {
                const val = this['value']['trim']();
                const savedBadge = document['getElementById']('groq_saved');
                const errBadge   = document['getElementById']('groq_error');
                if (!val) {
                    if (savedBadge) savedBadge['style']['display'] = 'none';
                    if (errBadge)   errBadge['style']['display'] = 'none';
                    return;
                }
                // FIXED: key must start with gsk_ and be at least 30 chars
                const isValid = val.startsWith('gsk_') && val.length >= 30;
                if (isValid) {
                    chrome['storage']['local']['set']({ 'groq_api_key': val });
                    if (savedBadge) { savedBadge['style']['display'] = 'flex'; setTimeout(() => { savedBadge['style']['display'] = 'none'; }, 2500); }
                    if (errBadge) errBadge['style']['display'] = 'none';
                } else {
                    if (savedBadge) savedBadge['style']['display'] = 'none';
                    if (errBadge) errBadge['style']['display'] = 'flex';
                }
            });
        }
    })(), document['getElementById']('activate')['addEventListener']('change', async function () {
        chrome['storage']['local']['set']({ '__ap': this['checked'] });
        const _pc = document['getElementById']('power-card');
        if (_pc) _pc['classList']['toggle']('active', this['checked']);
        let [A] = await chrome['tabs']['query']({ 'active': true, 'lastFocusedWindow': true });
        if (A) chrome['tabs']['sendMessage'](A['id'], { 'action': 'activate', 'status': this['checked'] });
    }), document['getElementById']('ais_visa_info')['addEventListener']('submit', async function (A) {
        A['preventDefault']();
        let B = document['getElementById']('reset_info');
        B['setAttribute']('disabled', 'disabled'), await new Promise(C => setTimeout(C, 0x1f4));
        // Save license keys before clearing — they should survive a reset
        var _savedLicense = await new Promise(function(r) {
            chrome.storage.local.get(['__cs_license_key', '__cs_license_email', '__cs_license_device', '__cs_license_date', '__cs_license_valid', '__cs_license_days_remaining', '__cs_lifetime_stats'], r);
        });
        await chrome['storage']['local']['clear']();
        // Restore license keys
        if (_savedLicense['__cs_license_key']) {
            await new Promise(function(r) { chrome.storage.local.set(_savedLicense, r); });
        }
        await chrome['storage']['local']['set']({
            '__ap': !![],
            '__cr': 0x0,
            'selectedCity': 'Toronto',
            'lat': 43.653524,
            'lng': -79.383907,
            'distance': '50',
            'jobType': 'Any',
            'fetchIntervalValue': '2',
            'fetchIntervalUnit': 's'
        }), chrome['runtime']['sendMessage']({ 'action': 'logout' }), B['classList']['toggle']('btn-success'), B['innerText'] = 'Success', await new Promise(C => setTimeout(C, 0x3e8)), B['classList']['toggle']('btn-success'), B['removeAttribute']('disabled'), B['innerText'] = 'Reset';
    });
    function t(A, B = ![]) {
        const C = document['getElementById']('tag-input-box'), D = document['createElement']('div');
        D['classList']['add']('tag'), D['innerHTML'] = A + '\x20<span\x20class=\x22remove-tag\x22>x</span>', C['insertBefore'](D, document['getElementById']('city-input')), document['getElementById']('clear-all')['style']['display'] = 'inline', D['querySelector']('.remove-tag')['addEventListener']('click', function () {
            u(this);
        }), !B && w(A);
    }
    function u(A) {
        const B = A['parentElement'], C = B['textContent']['trim']()['slice'](0x0, -0x1);
        B['remove'](), x(C), !document['querySelector']('.tag') && (document['getElementById']('clear-all')['style']['display'] = 'none');
    }
    function v() {
        const A = document['querySelectorAll']('.tag');
        A['forEach'](B => B['remove']()), y(), document['getElementById']('clear-all')['style']['display'] = 'none';
    }
    function w(A) {
        chrome['storage']['local']['get']('cityTags', function (B) {
            let C = B['cityTags'] || [];
            C['push'](A), chrome['storage']['local']['set']({ 'cityTags': C }, function () {
            });
        });
    }
    function x(A) {
        chrome['storage']['local']['get']('cityTags', function (B) {
            let C = B['cityTags'] || [];
            C = C['filter'](D => D['trim']()['toLowerCase']() !== A['trim']()['toLowerCase']()), chrome['storage']['local']['set']({ 'cityTags': C }, function () {
                chrome['storage']['local']['get']('cityTags', function (D) {
                });
            });
        });
    }
    function y() {
        chrome['storage']['local']['remove']('cityTags', function () {
        });
    }
    function z() {
        const A = document['getElementById']('tag-input-box');
        A['querySelectorAll']('.tag')['forEach'](B => B['remove']()), chrome['storage']['local']['get']('cityTags', function (B) {
            const C = B['cityTags'] || [];
            C['forEach'](D => t(D, !![]));
        });
    }
    document['getElementById']('clear-all')['addEventListener']('click', v), document['getElementById']('any-city-btn')['addEventListener']('click', function () {
        chrome['storage']['local']['get']('cityTags', function (A) {
            const B = A['cityTags'] || [];
            const C = B['some'](D => D['toLowerCase']() === 'any\x20city');
            if (C) {
                v();
                document['getElementById']('any-city-btn')['classList']['remove']('active');
                document['getElementById']('any-city-btn')['innerText'] = 'Any City';
            } else {
                v();
                t('Any\x20City');
                document['getElementById']('any-city-btn')['classList']['add']('active');
                document['getElementById']('any-city-btn')['innerText'] = 'Any City ✓';
            }
        });
    }), document['getElementById']('city-input')['addEventListener']('keyup', function (A) {
        if (A['key'] === 'Enter' && this['value']['trim']() !== '') {
            const B = this['value']['trim']();
            t(B), this['value'] = '';
        }
    }), chrome['runtime']['onMessage']['addListener']((A, B, C) => {
        if (A['action'] === 'playSound') {
            const D = new (window['AudioContext'] || window['webkitAudioContext'])();
            fetch(chrome['runtime']['getURL']('alert.wav'))['then'](E => E['arrayBuffer']())['then'](E => D['decodeAudioData'](E))['then'](E => {
                const F = D['createBufferSource']();
                F['buffer'] = E, F['connect'](D['destination']), F['start'](0x0), setTimeout(() => {
                    const G = D['createBufferSource']();
                    G['buffer'] = E, G['connect'](D['destination']), G['start'](0x0);
                }, 0x3e8), setTimeout(() => {
                    const G = D['createBufferSource']();
                    G['buffer'] = E, G['connect'](D['destination']), G['start'](0x0);
                }, 0x7d0);
            })['catch'](E => {
                console['error']('Failed\x20to\x20play\x20sound\x20via\x20Web\x20Audio\x20API:', E);
                const F = new Audio(chrome['runtime']['getURL']('alert.wav'));
                F['play']()['catch'](G => console['error']('Also\x20failed\x20with\x20HTML5\x20Audio:', G)), chrome['notifications']['create']({
                    'type': 'basic',
                    'iconUrl': chrome['runtime']['getURL']('images/icon128.png'),
                    'title': 'Amazon\x20Job\x20Alert!',
                    'message': 'A\x20matching\x20job\x20has\x20been\x20found!',
                    'priority': 0x2
                });
            });
        }
    }), z();
    chrome['storage']['local']['get']('cityTags', function (A) {
        const B = A['cityTags'] || [];
        if (B['some'](C => C['toLowerCase']() === 'any\x20city')) {
            document['getElementById']('any-city-btn')['classList']['add']('active');
            document['getElementById']('any-city-btn')['innerText'] = 'Any\x20City\x20\u2713';
        }
    });

    // ── Access badge — handled by license.js online verification ──
    // ─────────────────────────────────────────────────────────────


    // ── Upgrade button — UNLIMITED: hidden ───────────────────────
    (function() {
        const upgradeBtn = document['getElementById']('upgrade-btn');
        if (upgradeBtn) upgradeBtn['style']['display'] = 'none';
    })();
    // ─────────────────────────────────────────────────────────────

    // ── Guide Button — shows guide directly in popup ─────────────
    const _guideBtn = document['getElementById']('guide-btn');
    if (_guideBtn) {
        _guideBtn['addEventListener']('click', function(e) {
            e['preventDefault']();
            if (typeof Swal === 'undefined') return;
            Swal['fire']({
                'title': '',
                'html': '<div style="font-family:Inter,sans-serif;">' +
  '<div style="background:linear-gradient(135deg,rgba(34,211,168,0.12),rgba(59,130,246,0.12));border-radius:14px;padding:16px 18px;margin-bottom:14px;border:1px solid rgba(34,211,168,0.2);text-align:center;">' +
    '<div style="font-size:26px;margin-bottom:4px;">🎯</div>' +
    '<div style="font-size:18px;font-weight:800;color:#e2e8f0;">How to Get Shifts Fast</div>' +
    '<div style="font-size:12px;color:rgba(199,210,254,0.55);margin-top:3px;">CoderSnap Setup Guide</div>' +
  '</div>' +
  '<div style="background:rgba(34,211,168,0.05);border-left:3px solid #22d3a8;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">' +
    '<div style="font-weight:800;color:#22d3a8;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🌍 REGION — Search Center</div>' +
    '<div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Pick the <b style="color:#e2e8f0;">city closest to where you want to work</b>. Amazon searches jobs near its GPS coordinates.</div>' +
    '<div style="margin-top:7px;background:rgba(0,0,0,0.3);border-radius:8px;padding:7px 10px;font-family:monospace;font-size:11px;color:rgba(199,210,254,0.6);">REGION: Toronto ▼ &nbsp;|&nbsp; RADIUS: 150km ▼ &nbsp;|&nbsp; Any ▼</div>' +
  '</div>' +
  '<div style="background:rgba(59,130,246,0.05);border-left:3px solid #3b82f6;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">' +
    '<div style="font-weight:800;color:#93c5fd;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🏙️ TARGET CITIES — Result Filter</div>' +
    '<div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Filters which jobs get applied to. <b style="color:#4ade80;">Any City ✓</b> = apply to everything in the radius.</div>' +
    '<div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;">' +
      '<span style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#93c5fd;">Bolton ×</span>' +
      '<span style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#93c5fd;">Whitby ×</span>' +
      '<span style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#4ade80;">Any City ✓</span>' +
    '</div>' +
  '</div>' +
  '<div style="background:rgba(34,197,94,0.05);border-left:3px solid #22c55e;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">' +
    '<div style="font-weight:800;color:#4ade80;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px;">⚙️ HOW IT WORKS</div>' +
    '<div style="font-size:12px;color:rgba(199,210,254,0.7);line-height:2;background:rgba(0,0,0,0.25);border-radius:8px;padding:9px 12px;">' +
      '<span style="color:#22d3a8;font-weight:700;">REGION</span> Toronto + <span style="color:#3b82f6;font-weight:700;">RADIUS</span> 50km + <span style="color:#4ade80;font-weight:700;">CITIES</span> Any<br>' +
      '↓ Amazon returns jobs within 50km of Toronto<br>' +
      '↓ Extension applies to <b style="color:#4ade80;">ALL jobs found ✓</b>' +
    '</div>' +
  '</div>' +
  '<div style="background:linear-gradient(135deg,rgba(251,146,60,0.08),rgba(251,146,60,0.03));border:1px solid rgba(251,146,60,0.25);border-radius:10px;padding:12px 14px;text-align:left;">' +
    '<div style="font-weight:800;color:#fb923c;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:9px;">⚡ BEST SETTINGS FOR FASTEST RESULTS</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
      '<div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">' +
        '<div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">REGION</div>' +
        '<div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">Nearest city</div>' +
      '</div>' +
      '<div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">' +
        '<div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">RADIUS</div>' +
        '<div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">50–150 km</div>' +
      '</div>' +
      '<div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);border-radius:8px;padding:7px 10px;">' +
        '<div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">TARGET CITIES</div>' +
        '<div style="font-weight:700;color:#4ade80;font-size:12.5px;">Any City ✓</div>' +
      '</div>' +
      '<div style="background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);border-radius:8px;padding:7px 10px;">' +
        '<div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">SCAN INTERVAL</div>' +
        '<div style="font-weight:700;color:#fb923c;font-size:12.5px;">2 seconds ⚡</div>' +
      '</div>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.2);border-radius:7px;padding:8px 11px;font-size:11.5px;color:rgba(199,210,254,0.6);">' +
      '⚡ <b style="color:#fb923c;">2 sec interval</b> = 30 checks/min = fastest possible detection.' +
    '</div>' +
  '</div>' +
'</div>',
                'showConfirmButton': true,
                'confirmButtonText': '✕  Close Guide',
                'showCancelButton': false,
                'allowEscapeKey': true,
                'allowOutsideClick': true,
                'width': 'min(360px, 94vw)',
                'background': '#1a2332',
                'color': '#e2e8f0',
                'customClass': { 'htmlContainer': 'ss-guide-body' }
            });
        });
    }
    // ─────────────────────────────────────────────────────────────

});