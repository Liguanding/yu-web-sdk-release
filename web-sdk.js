(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.YuDataWebSDK = {}));
})(this, (function (exports) { 'use strict';

    const DEFAULT_CONFIG = {
        show_log: false,
        is_track_single_page: false,
        use_client_time: false,
        send_type: 'beacon',
        heatmap: {},
        web_url: undefined,
        cross_subdomain: false,
        source_channel: [],
        source_type: {},
        max_string_length: 1024,
        queue_timeout: 300,
        datasend_timeout: 8000,
        preset_properties: {},
        sls: undefined,
        // Maintain internal defaults
        debug: false,
        autoTrack: true,
    };

    const generateUUID = () => {
        let d = new Date().getTime();
        let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0;
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            let r = Math.random() * 16;
            if (d > 0) {
                r = (d + r) % 16 | 0;
                d = Math.floor(d / 16);
            }
            else {
                r = (d2 + r) % 16 | 0;
                d2 = Math.floor(d2 / 16);
            }
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };
    class Logger {
        constructor(enabled = false) {
            this.enabled = false;
            this.enabled = enabled;
        }
        enable() {
            this.enabled = true;
        }
        disable() {
            this.enabled = false;
        }
        info(...args) {
            if (this.enabled) {
                console.log('[WebSDK]', ...args);
            }
        }
        error(...args) {
            if (this.enabled) {
                console.error('[WebSDK]', ...args);
            }
        }
        warn(...args) {
            if (this.enabled) {
                console.warn('[WebSDK]', ...args);
            }
        }
    }
    const Storage = {
        get(key) {
            return localStorage.getItem(key);
        },
        set(key, value) {
            localStorage.setItem(key, value);
        },
        remove(key) {
            localStorage.removeItem(key);
        }
    };

    const DeviceInfoPlugin = {
        name: 'DeviceInfo',
        install: (sdk) => {
            const ua = navigator.userAgent;
            const width = window.screen.width;
            const height = window.screen.height;
            const language = navigator.language;
            let os = 'Unknown';
            if (ua.indexOf('Win') !== -1)
                os = 'Windows';
            else if (ua.indexOf('Mac') !== -1)
                os = 'MacOS';
            else if (ua.indexOf('Linux') !== -1)
                os = 'Linux';
            else if (ua.indexOf('Android') !== -1)
                os = 'Android';
            else if (ua.indexOf('like Mac') !== -1)
                os = 'iOS';
            let browser = 'Unknown';
            if (ua.indexOf('Chrome') !== -1)
                browser = 'Chrome';
            else if (ua.indexOf('Firefox') !== -1)
                browser = 'Firefox';
            else if (ua.indexOf('Safari') !== -1 && ua.indexOf('Chrome') === -1)
                browser = 'Safari';
            else if (ua.indexOf('Edge') !== -1)
                browser = 'Edge';
            const info = {
                $os: os,
                $browser: browser,
                $screen_width: width,
                $screen_height: height,
                $language: language,
                $user_agent: ua,
            };
            sdk.registerCommonProperties(info);
        }
    };

    const AutoTrackPlugin = {
        name: 'AutoTrack',
        install: (sdk) => {
            // Legacy autoTrack boolean support is handled in index.ts via plugin loading
            // Here we can access sdk.config.heatmap for advanced config
            const heatmapConfig = sdk.config.heatmap || {};
            // --- Page View ---
            const trackPageView = () => {
                if (sdk.config.disablePageview)
                    return;
                const props = {
                    $url: window.location.href,
                    $title: document.title,
                    $path: window.location.pathname,
                    $referrer: document.referrer
                };
                sdk.track('$pageview', props);
            };
            // Initial Load
            if (document.readyState === 'complete') {
                trackPageView();
            }
            else {
                window.addEventListener('load', trackPageView);
            }
            // SPA Support (History API)
            if (sdk.config.is_track_single_page) {
                const originalPushState = history.pushState;
                history.pushState = function (...args) {
                    originalPushState.apply(this, args);
                    // Wrap in timeout to ensure URL update
                    setTimeout(trackPageView, 0);
                };
                const originalReplaceState = history.replaceState;
                history.replaceState = function (...args) {
                    originalReplaceState.apply(this, args);
                    setTimeout(trackPageView, 0);
                };
                window.addEventListener('popstate', trackPageView);
                window.addEventListener('hashchange', trackPageView);
            }
            // --- Web Click ---
            // Check legacy disableClick or heatmap config
            const isClickEnabled = !sdk.config.disableClick && (heatmapConfig.clickmap !== 'not_collect');
            if (isClickEnabled) {
                document.addEventListener('click', (e) => {
                    const heatmapConfigLocal = sdk.config.heatmap || {};
                    const target = e.target;
                    // Page filter: collect_url
                    if (heatmapConfigLocal.collect_url && !heatmapConfigLocal.collect_url()) {
                        return;
                    }
                    // 1. Check if element should be collected (heatmap.collect_element)
                    if (heatmapConfigLocal.collect_element && !heatmapConfigLocal.collect_element(target)) {
                        return;
                    }
                    // 2. Identify clickable element
                    let elementToTrack = null;
                    // Check if target itself is trackable
                    if (isTrackable(target, heatmapConfigLocal)) {
                        elementToTrack = target;
                    }
                    else {
                        // Traverse up to find trackable parent
                        let current = target.parentElement;
                        while (current && current !== document.body) {
                            if (isTrackable(current, heatmapConfigLocal)) {
                                elementToTrack = current;
                                break;
                            }
                            current = current.parentElement;
                        }
                    }
                    if (!elementToTrack)
                        return;
                    // 3. Build Properties
                    const props = {
                        $element_id: elementToTrack.id,
                        $element_class_name: elementToTrack.className,
                        $element_content: getElementContent(elementToTrack, heatmapConfigLocal),
                        $element_type: elementToTrack.tagName,
                        $element_selector: getSelector(elementToTrack, heatmapConfigLocal),
                        $page_x: e.pageX,
                        $page_y: e.pageY,
                        $url: window.location.href,
                        $title: document.title
                    };
                    // 4. Custom Properties (heatmap.custom_property)
                    if (heatmapConfigLocal.custom_property) {
                        const customProps = heatmapConfigLocal.custom_property(elementToTrack);
                        if (customProps) {
                            Object.assign(props, customProps);
                        }
                    }
                    sdk.track('$WebClick', props);
                }, true);
            }
            // --- Web Stay (Duration) ---
            const isStayEnabled = !sdk.config.disableStay && (heatmapConfig.scroll_notice_map !== 'not_collect');
            if (isStayEnabled) {
                let lastStart = Date.now();
                let inactivityTimer = null;
                let totalStayMs = 0;
                const delay = typeof heatmapConfig.scroll_delay_time === 'number' ? heatmapConfig.scroll_delay_time : 4000;
                const maxDurationSec = typeof heatmapConfig.scroll_event_duration === 'number' ? heatmapConfig.scroll_event_duration : 18000;
                const emitStay = () => {
                    const now = Date.now();
                    const duration = now - lastStart;
                    if (duration >= delay) {
                        totalStayMs += duration;
                        const capped = Math.min(totalStayMs, maxDurationSec * 1000);
                        sdk.track('$WebStay', {
                            $duration: capped,
                            $url: window.location.href,
                            $title: document.title
                        });
                        lastStart = now;
                    }
                };
                const scheduleInactivity = () => {
                    if (inactivityTimer)
                        clearTimeout(inactivityTimer);
                    inactivityTimer = setTimeout(emitStay, delay);
                };
                window.addEventListener('scroll', () => {
                    scheduleInactivity();
                }, { passive: true });
                // Unload or tab hidden: flush
                const flush = () => {
                    emitStay();
                };
                window.addEventListener('beforeunload', flush);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden') {
                        flush();
                    }
                    else {
                        lastStart = Date.now();
                        scheduleInactivity();
                    }
                });
                // Initial schedule
                scheduleInactivity();
            }
        }
    };
    // Helper: Check if element is trackable based on config
    function isTrackable(element, config) {
        const tagName = element.tagName.toLowerCase();
        // 1. Check data-sensors-click attribute
        if (element.hasAttribute('data-sensors-click'))
            return true;
        // 1.1 track_attr attributes
        if (Array.isArray(config.track_attr)) {
            for (const attr of config.track_attr) {
                if (element.hasAttribute(attr))
                    return true;
            }
        }
        // 2. Default tags
        if (['a', 'button', 'input', 'textarea'].includes(tagName))
            return true;
        // 3. Configured tags (collect_tags) with optional max_level
        if (config.collect_tags && config.collect_tags[tagName]) {
            const rule = config.collect_tags[tagName];
            if (rule === true) {
                return true;
            }
            if (typeof rule === 'object' && typeof rule.max_level === 'number') {
                // Count depth from element to document.body
                let depth = 0;
                let current = element;
                while (current && current !== document.body && depth <= rule.max_level) {
                    current = current.parentElement;
                    depth++;
                }
                return depth <= rule.max_level + 1; // within limit
            }
        }
        return false;
    }
    // Helper: Get Element Content
    function getElementContent(element, config) {
        // Check if input collection is allowed
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            if (config.collect_input && config.collect_input(element)) {
                return element.value || '';
            }
            return '';
        }
        return element.innerText || '';
    }
    // Helper: Get Selector
    function getSelector(element, config) {
        if (config.element_selector !== 'not_use_id' && element.id) {
            return '#' + element.id;
        }
        if (element.className && typeof element.className === 'string') {
            return '.' + element.className.split(' ').join('.');
        }
        return element.tagName.toLowerCase();
    }

    class WebSDK {
        constructor() {
            this.loginId = null;
            this.commonProperties = {};
            this.dynamicProperties = {}; // Store dynamic property functions
            this.plugins = [];
            this.identities = {}; // Store bound identities
            this.queue = [];
            this.processing = false;
            this.config = DEFAULT_CONFIG;
            this.logger = new Logger(this.config.debug);
            this.anonymousId = Storage.get('web_sdk_distinct_id') || generateUUID();
            this.identities = JSON.parse(Storage.get('web_sdk_identities') || '{}');
            Storage.set('web_sdk_distinct_id', this.anonymousId);
        }
        init(config) {
            this.config = { ...this.config, ...config };
            // Map new config fields to internal legacy fields if needed, or use them directly
            if (this.config.show_log !== undefined) {
                this.config.debug = this.config.show_log;
            }
            if (this.config.debug) {
                this.logger.enable();
            }
            this.logger.info('SDK Initialized', this.config);
            // Register source attribution common properties
            const sourceProps = this.parseSourceAttribution();
            if (Object.keys(sourceProps).length) {
                this.registerCommonProperties(sourceProps);
            }
            // Load Default Plugins
            this.use(DeviceInfoPlugin);
            // AutoTrack logic update based on heatmap config or legacy autoTrack
            if (this.config.autoTrack || (this.config.heatmap && this.config.heatmap.clickmap === 'default')) {
                this.use(AutoTrackPlugin);
            }
        }
        // Proxy for compatibility with sensors.quick('autoTrack')
        quick(command, ...args) {
            if (command === 'autoTrack') {
                // Re-trigger auto track logic if needed or ensure it's enabled
                // For now, if autoTrack plugin is loaded, it handles things. 
                // If we need to support dynamic enable via quick, we might need to expose plugin methods.
                // Simplified: Just log for now as it's typically called after init.
                this.logger.info('quick autoTrack called');
            }
            else if (command === 'isReady') {
                if (typeof args[0] === 'function') {
                    args[0]();
                }
            }
            else if (command === 'trackHeatMap') {
                const el = args[0];
                const props = args[1] || {};
                if (el)
                    this.trackHeatMap(el, props);
            }
            else if (command === 'trackAllHeatMap') {
                const el = args[0];
                const props = args[1] || {};
                if (el)
                    this.trackAllHeatMap(el, props);
            }
        }
        use(plugin) {
            this.logger.info(`Installing plugin: ${plugin.name}`);
            plugin.install(this);
            this.plugins.push(plugin);
        }
        // Modified to support dynamic properties
        registerCommonProperties(props) {
            // Separate static and dynamic properties
            const staticProps = {};
            for (const key in props) {
                if (typeof props[key] === 'function') {
                    this.dynamicProperties[key] = props[key];
                }
                else {
                    staticProps[key] = props[key];
                }
            }
            this.commonProperties = { ...this.commonProperties, ...staticProps };
        }
        // Alias for registerCommonProperties
        registerPage(props) {
            this.registerCommonProperties(props);
        }
        clearCommonProperties() {
            this.commonProperties = {};
            this.dynamicProperties = {};
        }
        login(userId) {
            this.loginId = userId;
            this.storeSet('web_sdk_login_id', userId);
            this.track('$SignUp', { $original_id: this.anonymousId }); // Optional standard event
        }
        identify(id) {
            this.anonymousId = id;
            this.storeSet('web_sdk_distinct_id', this.anonymousId);
        }
        logout() {
            this.loginId = null;
            this.storeRemove('web_sdk_login_id');
            // Clear bound identities on logout as per documentation implies "reset" or new session context usually
            // But strict "logout" in simple mode just clears loginId. 
            // In full mode, it clears loginId and identities.
            this.identities = {};
            this.storeRemove('web_sdk_identities');
        }
        // --- Identity Binding APIs ---
        bind(key, value) {
            // 1. Update local identities
            this.identities[key] = value;
            this.storeSet('web_sdk_identities', JSON.stringify(this.identities));
            // 2. Track $BindID event
            this.track('$BindID', {
                [`${key}`]: value // Dynamic key for identity
            }, 'track_id_bind');
        }
        unbind(key, value) {
            // 1. Update local identities
            if (this.identities[key] === value) {
                delete this.identities[key];
                this.storeSet('web_sdk_identities', JSON.stringify(this.identities));
            }
            // 2. Track $UnbindID event
            this.track('$UnbindID', {
                [`${key}`]: value
            }, 'track_id_unbind');
        }
        resetAnonymousIdentity(id) {
            const newId = id || generateUUID();
            this.anonymousId = newId;
            this.storeSet('web_sdk_distinct_id', this.anonymousId);
            // Also need to clear identities usually? Documentation says:
            // "神策 SDK 会将 “anonymous_id”、“distinct_id”、“$identity_anonymous_id”、“$identity_cookie_id” 修改为接口调用时传入的值"
            // It implies a reset of the anonymous identity context.
        }
        // --- User Profile APIs ---
        setProfile(properties) {
            this.track('$profile_set', properties, 'profile_set');
        }
        setProfileOnce(properties) {
            this.track('$profile_set_once', properties, 'profile_set_once');
        }
        incrementProfile(properties) {
            let props = {};
            if (typeof properties === 'string') {
                props[properties] = 1;
            }
            else {
                props = properties;
            }
            this.track('$profile_increment', props, 'profile_increment');
        }
        appendProfile(properties) {
            this.track('$profile_append', properties, 'profile_append');
        }
        deleteProfile() {
            this.track('$profile_delete', {}, 'profile_delete');
        }
        unsetProfile(properties) {
            const props = {};
            if (Array.isArray(properties)) {
                properties.forEach(p => props[p] = true);
            }
            else {
                props[properties] = true;
            }
            this.track('$profile_unset', props, 'profile_unset');
        }
        trackHeatMap(element, properties = {}) {
            const props = this.buildClickProperties(element);
            Object.assign(props, properties);
            this.track('$WebClick', props);
        }
        trackAllHeatMap(element, properties = {}) {
            const props = this.buildClickProperties(element);
            Object.assign(props, properties);
            this.track('$WebClick', props);
        }
        buildClickProperties(element) {
            return {
                $element_id: element.id,
                $element_class_name: element.className,
                $element_content: this.getElementContent(element),
                $element_type: element.tagName,
                $element_selector: this.getSelector(element),
                $url: window.location.href,
                $title: document.title
            };
        }
        getElementContent(element) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                return element.value || '';
            }
            return element.innerText || '';
        }
        getSelector(element) {
            if (this.config.heatmap && this.config.heatmap.element_selector !== 'not_use_id' && element.id) {
                return '#' + element.id;
            }
            if (element.className && typeof element.className === 'string') {
                return '.' + element.className.split(' ').join('.');
            }
            return element.tagName.toLowerCase();
        }
        // --- Tracking ---
        track(eventName, properties = {}, type = 'track') {
            // Resolve dynamic properties
            const dynamicProps = {};
            for (const key in this.dynamicProperties) {
                try {
                    const val = this.dynamicProperties[key]();
                    if (val !== undefined && typeof val !== 'function') { // Simple check
                        dynamicProps[key] = val;
                    }
                }
                catch (e) {
                    // Ignore error
                }
            }
            const originEventData = {
                event: eventName,
                type: type, // Relax type check for custom types like track_id_bind
                properties: this.applyStringLimit({
                    ...this.commonProperties,
                    ...dynamicProps,
                    ...properties,
                    $time: Date.now(),
                }),
                time: Date.now(),
                distinct_id: this.loginId || this.anonymousId,
                anonymous_id: this.anonymousId,
                login_id: this.loginId || undefined,
                // Add identities field for full user association
                identities: {
                    $identity_anonymous_id: this.anonymousId,
                    $identity_cookie_id: this.anonymousId,
                    ...(this.loginId ? { $identity_login_id: this.loginId } : {}),
                    ...this.identities
                }
            }; // Cast to any to allow extra fields like identities
            this.logger.info(`Track Event: ${eventName}`, originEventData);
            const eventData = {
                event_type: eventName,
                event_data: JSON.stringify(originEventData)
            };
            this.send(eventData);
        }
        getPresetProperties() {
            return {
                $url: window.location.href,
                $title: document.title,
                $referrer: document.referrer,
                $screen_width: window.screen.width,
                $screen_height: window.screen.height,
                $sdk_version: '1.0.0'
            };
        }
        send(data) {
            const type = this.config.send_type || 'beacon';
            if (type !== 'sls') {
                const url = this.config.server_url;
                if (!url) {
                    this.logger.warn('Server URL not configured. Dropping event.');
                    return;
                }
            }
            else {
                if (!this.isSLSConfigValid()) {
                    this.logger.warn('SLS config not valid. Dropping event.');
                    return;
                }
            }
            const enqueue = () => {
                this.queue.push(data);
                if (!this.processing) {
                    this.processing = true;
                    const delay = this.config.queue_timeout || 0;
                    setTimeout(() => this.flush(), delay);
                }
            };
            enqueue();
        }
        flush() {
            const next = this.queue.shift();
            if (!next) {
                this.processing = false;
                return;
            }
            const type = this.config.send_type || 'beacon';
            const payload = JSON.stringify(next);
            const onDone = () => {
                if (this.queue.length > 0) {
                    const delay = this.config.queue_timeout || 0;
                    setTimeout(() => this.flush(), delay);
                }
                else {
                    this.processing = false;
                }
            };
            if (type === 'sls') {
                this.sendSLS(next, onDone);
                return;
            }
            const url = this.config.server_url;
            if (type === 'beacon') {
                const blob = new Blob([payload], { type: 'application/json' });
                const ok = navigator.sendBeacon(url, blob);
                if (!ok) {
                    this.sendAjax(url, payload).finally(onDone);
                }
                else {
                    onDone();
                }
                return;
            }
            if (type === 'ajax') {
                this.sendAjax(url, payload).finally(onDone);
                return;
            }
            if (type === 'image') {
                try {
                    const img = new Image();
                    img.onload = () => onDone();
                    img.onerror = () => onDone();
                    const q = encodeURIComponent(payload);
                    img.src = `${url}?data=${q}`;
                }
                catch {
                    onDone();
                }
                return;
            }
            this.sendAjax(url, payload).finally(onDone);
        }
        isSLSConfigValid() {
            const c = this.config.sls;
            if (!c)
                return false;
            if (c.endpoint)
                return true;
            return !!(c.project && c.logstore && c.region);
        }
        buildSLSUrl(data) {
            const c = this.config.sls;
            const base = c.endpoint ? c.endpoint : `https://${c.project}.${c.region}.log.aliyuncs.com`;
            const path = `/logstores/${c.logstore}/track`;
            const params = { APIVersion: '0.6.0', __topic__: data.event };
            const props = { ...data.properties, distinct_id: data.distinct_id, anonymous_id: data.anonymous_id };
            for (const k in props) {
                const v = props[k];
                if (v === undefined || v === null)
                    continue;
                params[k] = typeof v === 'object' ? JSON.stringify(v) : v;
            }
            const qs = this.toQuery(params);
            return `${base}${path}?${qs}`;
        }
        toQuery(params) {
            const pairs = [];
            for (const k in params) {
                const v = params[k];
                pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
            }
            return pairs.join('&');
        }
        sendSLS(data, onDone) {
            const c = this.config.sls;
            // Handle wrapped data if present
            let eventData = data;
            if (data.event_data && typeof data.event_data === 'string') {
                try {
                    eventData = JSON.parse(data.event_data);
                }
                catch {
                    // Ignore parse error, maybe log?
                }
            }
            const method = c.method || 'get';
            if (method === 'get') {
                try {
                    const url = this.buildSLSUrl(eventData);
                    const img = new Image();
                    img.onload = () => onDone();
                    img.onerror = () => onDone();
                    img.src = url;
                }
                catch {
                    onDone();
                }
                return;
            }
            const url = (c.endpoint ? c.endpoint : `https://${c.project}.${c.region}.log.aliyuncs.com`) + `/logstores/${c.logstore}/track?APIVersion=0.6.0`;
            const payload = JSON.stringify({ __topic__: eventData.event, ...eventData.properties, distinct_id: eventData.distinct_id, anonymous_id: eventData.anonymous_id });
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
            const timeout = this.config.datasend_timeout || 8000;
            const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
            fetch(url, {
                method: 'POST',
                body: payload,
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                signal: controller ? controller.signal : undefined
            }).catch(() => { }).finally(() => {
                if (timer)
                    clearTimeout(timer);
                onDone();
            });
        }
        sendAjax(url, payload) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
            const timeout = this.config.datasend_timeout || 8000;
            const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
            return fetch(url, {
                method: 'POST',
                body: payload,
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                signal: controller ? controller.signal : undefined
            }).catch(err => {
                this.logger.error('Failed to send event', err);
            }).finally(() => {
                if (timer)
                    clearTimeout(timer);
            });
        }
        storeSet(key, value) {
            if (this.config.cross_subdomain) {
                const domain = this.getRootDomain();
                if (domain) {
                    document.cookie = `${key}=${encodeURIComponent(value)};path=/;domain=.${domain}`;
                    return;
                }
            }
            Storage.set(key, value);
        }
        storeRemove(key) {
            if (this.config.cross_subdomain) {
                const domain = this.getRootDomain();
                if (domain) {
                    document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${domain}`;
                    return;
                }
            }
            Storage.remove(key);
        }
        getRootDomain() {
            const host = window.location.hostname;
            if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost')
                return null;
            const parts = host.split('.');
            if (parts.length <= 2)
                return host;
            return parts.slice(parts.length - 2).join('.');
        }
        parseSourceAttribution() {
            const url = new URL(window.location.href);
            const qp = url.searchParams;
            const props = {};
            const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
            utms.forEach(k => {
                const v = qp.get(k);
                if (v)
                    props[k] = v;
            });
            if (Array.isArray(this.config.source_channel)) {
                this.config.source_channel.forEach(k => {
                    const v = qp.get(k);
                    if (v)
                        props[k] = v;
                });
            }
            return props;
        }
        applyStringLimit(props) {
            const max = this.config.max_string_length || 1024;
            const out = {};
            for (const k in props) {
                const v = props[k];
                if (typeof v === 'string' && v.length > max) {
                    out[k] = v.slice(0, max);
                }
                else {
                    out[k] = v;
                }
            }
            return out;
        }
    }
    // Export a singleton instance by default, but allow class access
    const sdk = new WebSDK();

    exports.WebSDK = WebSDK;
    exports.sdk = sdk;

}));
//# sourceMappingURL=web-sdk.js.map
