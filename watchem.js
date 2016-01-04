/**
 *  A very simple, one file script to watches for .js files present in DOM
 *  over AJAX and reload the page when changes are detected.
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
 *
 *  @license MIT
 *  @version 0.4.0
 *  @author Dumitru Uzun (DUzun.Me)
 */

(function (win, undefined) {
    var version = '0.4.0';

    // Settings
    var interval     = 500  // Recheck interval
    ,   reDOM        = 5e3  // Recheck DOM interval
    ,   selfWatch    = true // Watch document change
    ,   cssWatch     = true // Watch CSS change
    ,   ignoreMin    = true // Ignore .min.js or .min.css
    ,   defMethod    = 'HEAD'
    ,   altMethod    = 'GET'
    ,   noCacheParam = '_w_'
    ,   headers      = { 'X-Requested-With': 'Watchem' }
    ;

    // Local variables
    var document = win.document
    ,   loc      = win.location
    ,   hostname = loc.hostname
    ,   LS       = win.localStorage
    ,   setTimeout   = win.setTimeout
    ,   clearTimeout = win.clearTimeout
    ,   list     = []
    ,   extern   = {}
    ,   states   = {}
    ,   types    = {}
    ,   watchem  = {
            list  : list
          , extern: extern
          , states: states
          , types : types

          , stopped: undefined

          , stop : stop  // stop the watcher
          , start: start // start the watcher
          , init : init  // init with resources from DOM
          , run  : run   // one tick of watcher (used internally)

          , debug: debug
        }
    ,   slice    = list.slice
    ,   a        = document.createElement('a')
    ,   ncReg    = new RegExp('(\\?|\\&)'+noCacheParam+'=[^\\&]+')
    ,   idx
    ,   runTo
    ,   initTo
    ;

    // Our AJAX method: jajax(options, success, error)
    var jajax = win.jajax || (function ($) {
        if ( !($ && $.ajax) ) {
            throw new Error('Watchem: no jAJAX, jQuery or Zepto found!');
        }
        return function (opt, suc, err) {
            return $.ajax(opt).done(suc).fail(err)
        }
    }(win.jQuery||win.Zepto));


    // Implementation functions:

    function init() {
        runTo  && clearTimeout(runTo);
        initTo && clearTimeout(initTo);

        if ( LS ) {
            watchem.stopped = +LS.watchemStopped || false;
        }

        a.href = loc.href;

        var candiates = getScripts().map(filtSrc).filter(identity);
        if ( cssWatch ) {
            candiates = candiates.concat(
              getStyleSheets().map(filtSrc).filter(identity)
            );
        }
        if ( selfWatch ) {
            candiates.push(getPath(loc));
        }

        // Potentially external (to DOM) resources
        var watchemToo = win.watchemToo;
        var externCandidates = {};

        if ( watchemToo ) {
            Object.keys(watchemToo).forEach(function (u) {
                a.href = u;
                if ( a.hostname != hostname ) {
                    delete watchemToo[u];
                    return;
                }
                var url = getPath(a);
                if ( watchemToo[u] ) {
                    candiates.push(url);
                    externCandidates[url] = true;
                }
                else {
                    states[url] = false;
                }
            });
        }

        function add(url, etag) {
            if ( !(url in states) ) {
              debug('tracking ', url, ': "' + (etag+'').replace(/[\r\n]+/g,' ').substr(0, 64) + '"');
              list.push(url);
              if ( externCandidates[url] ) {
                  extern[url] = true;
              }
            }
            states[url] = etag ;
        }

        candiates.forEach(function (url) {
            if ( !url ) return;
            if ( !(url in states) ) request(defMethod, url
              , function (result, status, xhr) {
                    var etag = getETag(xhr, result);
                    if ( !etag ) {
                        request(altMethod, url
                          , function (result, status, xhr) {
                                var etag = getETag(xhr, result);
                                types[url] = altMethod;
                                add(url, etag);
                            }
                        );
                    }
                    else {
                        add(url, etag);
                    }
                }
            );
        });

        idx = 0;
        runTo = !watchem.stopped && interval && setTimeout(run, interval);
        initTo = reDOM && setTimeout(init, reDOM);

        return watchem;
    }

    // Loop through the list of watched resources, asynchronously.
    function run() {
        var i = idx
        ,   url = list[i]
        ,   type = types[url] || defMethod
        ;
        // debug(type + ':'+idx+':'+url); // for debug
        request(type, url
          , function (result, status, xhr) {
                var _interval = interval;
                var etag = getETag(xhr, result);
                if ( states[url] != etag ) {
                    debug('change detected in ', url, ': "' + states[url] + '" != "' + etag + '"');
                    var ext = getExt(url);
                    if ( ext == 'css' ) {
                        var links = getStyleSheets(url);
                        if ( links.length ) {
                            var link = links.pop();
                            (link.ownerNode || link).href = getNCUrl(link.href);
                            states[url] = etag;
                            // _interval = 1e3; // Give it time to load
                        }
                        else {
                            reload();
                        }
                    }
                    else {
                        _interval = 0;
                        // Delay reload for external, giving priority to potentially
                        // open document with which contains the external url.
                        reload(extern[url] ? interval : 0);
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
                if ( !watchem.stopped ) {
                    runTo && clearTimeout(runTo);
                    runTo = _interval && setTimeout(run, _interval);
                }
            }
          , function (xhr, error) {
                if ( !watchem.stopped ) {
                    reload();
                }
            }
        );
    }

    function stop() {
        runTo && clearTimeout(runTo);
        runTo = undefined;
        watchem.stopped = now();
        if ( LS ) {
            LS.watchemStopped = watchem.stopped;
        }
    }

    function start() {
        if ( watchem.stopped ) {
            delete watchem.stopped;
            if ( LS ) {
                delete LS.watchemStopped;
            }
            init();
        }
        else {
            run();
        }
    }

    function request(method, url, onsuc, onerr) {
        return jajax(
            {
                url: getNCUrl(url, method)
              , method: method
              , headers: headers
              // , crossDomain: true // removes X-Requested-With header
            }
          , onsuc
          , onerr
        );
    }

    function reload(delay) {
        delay
          ? setTimeout(reload.bind(undefined,0))
          : loc.reload()
    }

    function now() {
        return Date.now() || (new Date).getTime()
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
            a.href = href;
            href = a.href;
            links = links.filter(function (l) {
                var h = l.href;
                return ( h && h.indexOf(href) == 0 )
            });
        }
        return links;
    }

    function getExt(url) {
        a.href = url;
        var pathname = a.pathname;
        return pathname.split('.').pop();
    }

    function getPath(a) {
        return a.pathname+a.search.replace(ncReg, '')
    }

    function getNCUrl(url, meth) {
        var href = url.replace(ncReg, '');
        if ( !meth || meth == 'HEAD' ) {
            href += (href.indexOf('?') < 0 ? '?' : '&')+noCacheParam+'='+(now()&0x3FFFFF).toString(36);
        }
        return href;
    }

    function filtSrc(l) {
        var href = l.src || l.href;
        if ( !href ) return undefined;
        var ext = getExt(href);
        if ( a.hostname != hostname ) return undefined;
        if ( ignoreMin && a.pathname.indexOf('.min.') > 0 ) return;
        return '.css.js'.indexOf(ext) > -1 && a.pathname.indexOf('/jasmine/lib/') == -1
            ? getPath(a)
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
                    // Compact Last-Modified - not necessary, just for fun and debug
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


    function debug() {
        if ( win.console && console.debug ) {
            watchem.debug = debug = console.debug.bind(console);
            return debug.apply(console, arguments);
        }
    }

    init.version = version;

    // AMD
    if ( typeof define == 'function' && define.amd) {
        define([], init)
    }
    else {
        // Init with delay
        initTo = setTimeout(init, interval);
        // Catch new stuff on DOMContentLoaded
        document.addEventListener('DOMContentLoaded', init);

        win.watchem = watchem;
    }

}
(this));
