/**
 *  A very simple, one file script to watches for .js & .css files present in DOM
 *  over AJAX and reload the page or style when changes are detected.
 *
 *  @license MIT
 *  @version 0.7.0
 *  @author Dumitru Uzun (DUzun.Me)
 */

/**
 *  @about
 *
 *  It makes HEAD requests to the server in the specified interval and compares
 *  ETag or Last-Modified headers with the stored value.
 *
 *  If server does not return ETag or Last-Modified headers, it makes
 *  GET requests (which are more expensive) and compares the contents of the file.
 *
 *  Note:
 *     For advanced stuff I recomend http://www.browsersync.io/.
 *     I've built this script to automatically run Jasmine test inside a
 *     Chrome Extension on source files change.
 *
 *  Requires https://github.com/duzun/jAJAX
 *           or jQuery v1.5+
 *           or Zepto v1.1+ with "callbacks" and "deferred" modules loaded.
 *
 */

/*globals define, globalThis*/

(function (win, undefined) {
    const version = '0.7.0';
    const JAJAX_URL = 'https://unpkg.com/jajax.js';

    const noCacheParam = '_w_';

    // Local variables
    const {
        document,
        location,
        localStorage,
        setTimeout,
        clearTimeout,
        JSON,
    } = win,
    { hostname, origin } = location

    ,   list     = []
    ,   extern   = {}
    ,   states   = {}
    ,   types    = {}

    ,   slice    = list.slice
    ,   a        = document.createElement('a')
    ,   ncReg    = new RegExp('(\\?|\\&)'+noCacheParam+'=[^\\&]+')
    ;

    const options = {
        interval: 700,  // Recheck/ping interval
        reDOM:    7e3,  // Recheck DOM interval

        wDoc:  true, // Watch this document change
        wCSS:  true, // Watch CSS change
        wJS:   true, // Watch JS change
        noMin: true, // Ignore .min.js or .min.css

        hostAlias: {}, // eg. { 'cdn.example.com': 'example.com', 'www.example.com': 'example.com' }

        wHosts: [hostname], // Automatically watch JS & CSS only for these hostnames
        // !!! CORS restrictions apply !!!

        // Ping request methods
        defMethod: 'HEAD',
        altMethod: 'GET',

        headers: { 'X-Requested-With': 'Watchem' },
    };

    const watchem  = {
        list
      , extern
      , states
      , types
      , options

      , stopped: undefined

      , stop  // stop the watcher
      , start // start the watcher
      , init  // init with resources from DOM
      , run   // one tick of watcher (used internally)
      , watch // add files to watch

      , setOption

      , saveOptions // to localStorage
      , loadOptions // from localStorage

      , debug
    };

    let idx
    ,   runTo
    ,   initTo
    ;

    // Our AJAX method: jajax(options, success, error)
    let jajax = win.jajax || (function ($) {
        if ( !($ && $.ajax) ) {
            debug('Loading ', JAJAX_URL);
            load_js(JAJAX_URL, () => {
                setTimeout(() => {
                    if ( win.jajax ) {
                        jajax = win.jajax;
                    }
                }, 16);
            });
        }
        return (opt, suc, err) => {
            if ( !($ && $.ajax) ) {
                throw new Error('Watchem: no jAJAX, jQuery or Zepto found!');
            }
            return $.ajax(opt).done(suc).fail(err);
        };
    }(win.jQuery||win.Zepto));

    // Implementation functions:

    function init(files) {
        initTo && clearTimeout(initTo);

        if ( localStorage ) {
            // Load options only on first run
            if(runTo == undefined) {
                loadOptions();
            }
            else {
                watchem.stopped = +localStorage.watchemStopped || false;
            }
        }

        a.href = origin;

        let candiates = [];

        if ( options.wCSS ) {
            candiates = candiates.concat(
              getStyleSheets().map(filtSrc).filter(identity)
            );
        }

        if ( options.wJS ) {
            candiates = candiates.concat(
                getScripts().map(filtSrc).filter(identity)
            );
        }

        if ( options.wDoc ) {
            candiates.push(getPath(location));
        }

        watch(candiates);

        files && !files.type && watch(files, true);

        // Potentially external (to DOM) resources
        const { watchemToo } = win;
        if ( watchemToo ) {
            watch(watchemToo, true);
        }

        idx = 0;
        initTo = options.reDOM && setTimeout(init, options.reDOM);
        runAfter(options.interval);

        return watchem;
    }

    function watch(files, asExtern) {
        function add(url, etag, added) {
            if ( added ) {
                debug('tracking ', url, ': "' + (etag+'').replace(/[\r\n]+/g,' ').substr(0, 64) + '"');
                if ( asExtern ) {
                    extern[url] = true;
                }
            }
        }

        if ( !files ) return;

        if ( typeof files == 'string' ) {
            files = [files];
        }

        if( Array.isArray(files) ) {
            files.forEach(function (u) {
                let url = normPath(u);
                if ( url ) {
                    getState(url, add);
                }
            });
        }
        else {
            Object.keys(files).forEach(function (u) {
                let url = normPath(u);
                if ( !url ) {
                    delete files[u];
                    return;
                }
                if ( files[u] ) {
                    getState(url, add);
                }
                else {
                    states[url] = false;
                }
            });
        }
    }

    // Loop through the list of watched resources, asynchronously.
    function run(files) {
        if ( files ) {
            watch(files, true);
        }

        if(!list.length) return runAfter(options.interval << 1); // no files to watch yet

        let i = idx
        ,   url = list[i]
        ,   type = types[url] || options.defMethod
        ;
        // debug(type + ':'+idx+':'+url); // for debug
        request(type, url
          , function (result, status, xhr) {
                let _interval = options.interval;
                const etag = getETag(xhr, result);
                if ( states[url] != etag ) {
                    const ext = getExt(url);
                    debug(`change detected in ${url}: "${states[url]}" != "${etag}"`);
                    if ( ext == 'css' ) {
                        const links = getStyleSheets(url);
                        if ( links.length ) {
                            const link = links.pop();
                            (link.ownerNode || link).href = getNCUrl(link.href);
                            states[url] = etag;
                            // _interval = 1e3; // Give it time to load
                        }
                        else {
                            // Can't detect which <link rel=stylesheet /> has changed - reload the whole page
                            reload();
                        }
                    }
                    else {
                        // Delay reload for external, giving priority to potentially
                        // open document with which contains the external url.
                        reload(extern[url] ? _interval : 0);
                        _interval = 0;
                        return;
                    }
                }
                else {
                    if ( idx === i ) {
                        ++idx;
                        if ( idx >= list.length ) {
                            idx = 0;
                        }
                        else {
                            _interval = 4;
                        }
                    }
                }
                runAfter(_interval);
            }
          , function (xhr, error) {
                if ( !watchem.stopped ) {
                    reload();
                }
            }
        );
    }

    function runAfter(delay) {
        runTo && clearTimeout(runTo);
        return runTo = !watchem.stopped && delay && setTimeout(run, delay);
    }

    function stop() {
        runTo && clearTimeout(runTo);
        runTo = undefined;
        watchem.stopped = now();
        if ( localStorage ) {
            localStorage.watchemStopped = watchem.stopped;
        }
    }

    function start(files) {
        if ( watchem.stopped ) {
            delete watchem.stopped;
            if ( localStorage ) {
                delete localStorage.watchemStopped;
            }
            init(files);
        }
        else {
            run(files);
        }
    }

    function request(method, url, onsuc, onerr) {
        return jajax(
            {
                url: getNCUrl(url, method)
              , method
              , headers: options.headers
              , dataType: 'text'
              // , crossDomain: true // removes X-Requested-With header
            }
          , onsuc
          , onerr
        );
    }

    function reload(delay) {
        delay
          ? setTimeout(reload.bind(undefined,0))
          : location.reload();
    }

    function setOption(name, value, store) {
        if(value === undefined && typeof name != 'string') {
            Object.assign(options, name);
        }
        else {
            options[name] = value;
        }
        if ( store ) {
            saveOptions();
        }
    }

    function saveOptions() {
        if ( localStorage ) {
            localStorage.watchem = JSON.stringify(options);
        }
    }

    function loadOptions() {
        if ( localStorage ) {
            watchem.stopped = +localStorage.watchemStopped || false;

            let _options = localStorage.watchem;
            _options = _options && JSON.parse(_options);
            if(_options) setOption(_options);
        }
    }

    function now() {
        return Date.now();
    }

    function identity(val) {
        return val;
    }

    function getScripts() {
        var scripts = slice.call(document.scripts || document.querySelectorAll('script[src]'));
        return scripts;
    }

    function getStyleSheets(href) {
        var _links = slice.call(document.styleSheets || document.querySelectorAll('link[rel=stylesheet][href]'));
        var links = [];
        for ( var i = 0, l; i < _links.length; i++ ) {
            l = _links[i];
            if ( l.href ) links.push(l);
            else  // @TODO: track @import from external CSS, avoiding circular @import
            if ( l = l.cssRules ) {
                _links = _links.concat( slice.call(l) );
            }
        }
        if ( href ) {
            a.hostname = hostname; // if href is relative, it should be relative to location
            a.href = href;
            href = a.href;
            const { hostname: _hostname, pathname, search } = a;
            const hosts = [_hostname];
            const { hostAlias } = options;
            const altHostname = hostAlias[_hostname];
            if(altHostname) hosts.push(altHostname);

            links = links.filter(function (l) {
                let h = l.href;
                if(!h) return;

                a.href = h;
                if(a.pathname != pathname) return;
                if(search && a.search != search) return;

                const _host = a.hostname;
                if(!~hosts.indexOf(_host)) {
                    const altAHostname = hostAlias[_host];
                    if(!altAHostname || !~hosts.indexOf(altAHostname)) return;
                }

                return true;
                // return ( h && h.indexOf(href) == 0 );
            });
        }
        return links;
    }

    function getExt(url) {
        a.href = url;
        var pathname = a.pathname;
        return pathname.split('.').pop();
    }

    function getPath(a, withOrigin) {
        return (withOrigin?a.origin:'') + a.pathname+a.search.replace(ncReg, '');
    }

    function normPath(url, withOrigin) {
        a.href = origin; // required for rel url
        a.href = url;
        if(withOrigin == undefined) {
            const { hostAlias } = options;
            const _host = a.hostname;
            const _aHost = hostAlias && hostAlias[_host];
            withOrigin = _host != hostname && (!_aHost || _aHost != hostname);
        }
        return getPath(a, withOrigin);
    }

    function getNCUrl(url, meth) {
        var href = url.replace(ncReg, '');
        if ( !meth || meth == 'HEAD' ) {
            href += (href.indexOf('?') < 0 ? '?' : '&')+noCacheParam+'='+(now()&0x3FFFFF).toString(36);
        }
        return href;
    }

    function filtSrc(l) {
        const href = l.src || l.href;
        if ( !href ) return;
        const ext = getExt(href);
        const { wHosts, hostAlias } = options;

        let _host = a.hostname;
        let _aHost = hostAlias && hostAlias[_host];
        // Unknown host
        if(wHosts && wHosts.length) {
            if ( wHosts.indexOf(_host) == -1 && (!_aHost || wHosts.indexOf(_aHost) == -1) ) {
                return;
            }
        }
        if ( options.noMin && a.pathname.indexOf('.min.') > 0 ) return;
        return '.css.js'.indexOf(ext) > -1 && a.pathname.indexOf('/jasmine/lib/') == -1
            ? getPath(a, _host != hostname && (!_aHost || _aHost != hostname))
            : undefined;
    }

    function getETag(xhr, result) {
        if ( xhr ) {
            var headers = ['Content-Type', 'Content-Length', 'Last-Modified', 'ETag']
            ,   ret = []
            ,   i, h, v
            ;
            for ( i = headers.length; i--; ) {
                if ( v = xhr.getResponseHeader(h = headers[i]) ) {
                    // ETag alone is enough
                    if ( h == 'ETag' ) {
                        return v;
                    }
                    // Compact Last-Modified for fun and debug
                    if ( h == 'Last-Modified' ) {
                        v = (new Date(v) / 1e3).toString(36);
                    }
                    ret[i] = v;
                }
            }
            if ( ret.length ) return ret.join('~');
        }
        return result;
    }


    function addURL(url, etag, altMethod) {
        var inState = url in states;
        if ( !inState ) {
            list.push(url);
        }
        if ( altMethod ) {
            types[url] = altMethod;
        }
        states[url] = etag;

        return !inState;
    }

    function getState(url, ondone) {
        if ( !url ) return;
        if ( !(url in states) ) return request(options.defMethod, url
          , function (result, status, xhr) {
                var etag = getETag(xhr, result);
                if ( !etag ) {
                    request(options.altMethod, url
                      , function (result, status, xhr) {
                            var etag = getETag(xhr, result);
                            ondone(url, etag, addURL(url, etag, options.altMethod));
                        }
                    );
                }
                else {
                    ondone(url, etag, addURL(url, etag));
                }
            }
        );
    }

    function debug() {
        const { console } = win;
        if ( console && console.debug ) {
            debug = //jshint ignore:line
            watchem.debug =
            console.debug.bind(console);
            return debug.apply(console, arguments);
        }
    }

    function load_js(src, clb) {
        let s = document.createElement('SCRIPT');
        s.async = 1;
        s.src = src;
        let b = document.getElementsByTagName('script')[0];
        s.onload = s.onreadystatechange = function (evt) {
            if( s && (!(b=s.readyState)||b=='loaded'||b=='complete') ) {
                if ( s ) {
                    clb && clb.call(s, evt);
                    if ( s.parentNode ) {
                        s.parentNode.removeChild(s);
                    }
                    s = undefined;
                }
            }
        };
        b.parentNode.insertBefore(s, b);
        return s;
    }

    init.version = version;

    // AMD
    if ( typeof define == 'function' && define.amd) {
        init.watchem = watchem;
        define([], init);
    }
    // Browser - global scope
    else {
        // Init with delay
        initTo = setTimeout(init, options.interval);

        // Catch new stuff on DOMContentLoaded & window.load
        if(document.addEventListener) {
            document.addEventListener('DOMContentLoaded', init);
            win.addEventListener('load', init);
        }

        win.watchem = watchem;

        const watchemInit = win.watchemInit;
        if(watchemInit) watchemInit(watchem, options);
    }
}
(typeof globalThis != 'undefined' ? globalThis : window));
