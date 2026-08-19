// clickHelper.js — MAIN world. Clicks Create Application + I Agree using debugger-level events.
(function() {
    'use strict';
    if (!window.location.href.includes('/application/')) return;
    
    var _clicked = false;
    var _isIntegrityPage = window.location.href.includes('application-integrity');
    
    function getButton() {
        if (_isIntegrityPage) {
            return document.querySelector('button[data-test-id="integrity-notice-agree-button"]');
        }
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].querySelector('img')) continue;
            if (buttons[i].textContent.trim() === 'Create Application') return buttons[i];
        }
        return null;
    }
    
    function simulateRealClick(element) {
        // Get element center coordinates
        var rect = element.getBoundingClientRect();
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        
        // Create events with all properties a real click would have
        var commonProps = {
            bubbles: true, cancelable: true, view: window,
            detail: 1, screenX: x, screenY: y, clientX: x, clientY: y,
            ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
            button: 0, buttons: 1, relatedTarget: null
        };
        
        // Full sequence: pointerdown → mousedown → pointerup → mouseup → click
        element.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, commonProps, { pointerId: 1, pointerType: 'mouse' })));
        element.dispatchEvent(new MouseEvent('mousedown', commonProps));
        
        // Small delay between down and up (simulates real finger/mouse)
        setTimeout(function() {
            element.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, commonProps, { pointerId: 1, pointerType: 'mouse', buttons: 0 })));
            element.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, commonProps, { buttons: 0 })));
            element.dispatchEvent(new MouseEvent('click', Object.assign({}, commonProps, { buttons: 0 })));
            
            // Also try native click after event sequence
            element.click();
            
            // ALSO: directly invoke React's internal click handler if it exists
            // React 17 stores handlers on __reactFiber or __reactInternalInstance
            try {
                var keys = Object.keys(element);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].startsWith('__reactFiber') || keys[k].startsWith('__reactInternalInstance')) {
                        var fiber = element[keys[k]];
                        // Walk up to find onClick handler
                        var current = fiber;
                        while (current) {
                            if (current.memoizedProps && current.memoizedProps.onClick) {
                                console.log('[clickHelper] Found React onClick handler — invoking directly');
                                current.memoizedProps.onClick({ preventDefault: function(){}, stopPropagation: function(){}, nativeEvent: new MouseEvent('click'), target: element, currentTarget: element });
                                return;
                            }
                            current = current.return;
                        }
                    }
                }
            } catch(e) { console.log('[clickHelper] React handler lookup failed:', e.message); }
            
            console.log('[clickHelper] Full click sequence dispatched for:', _isIntegrityPage ? 'I Agree' : 'Create Application');
        }, 50); // 50ms between down and up
    }
    
    // Wait 3 seconds for React to fully hydrate, then click
    setTimeout(function() {
        function attempt() {
            if (_clicked) return;
            var btn = getButton();
            if (btn) {
                _clicked = true;
                simulateRealClick(btn);
            }
        }
        
        attempt();
        // Retry every 1s if not clicked
        if (!_clicked) {
            var _poll = setInterval(function() {
                if (_clicked) { clearInterval(_poll); return; }
                attempt();
            }, 1000);
            setTimeout(function() { clearInterval(_poll); }, 30000);
        }
    }, 3000);
})();
