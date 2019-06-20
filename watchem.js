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
 *  @version 0.6.2
 *  @author Dumitru Uzun (DUzun.Me)
 */

/*globals define*/

(function (win, undefined) {
    var version = '0.6.2';

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
          , watch: watch // add files to watch

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
            load_js('https://cdn.rawgit.com/duzun/jAJAX/master/dist/jajax.1.2.0.min.js', 
            function () {
                if ( win.jajax ) {
                    jajax = win.jajax;
                }
            });
        }
        return function (opt, suc, err) {
            if ( !($ && $.ajax) ) {
                throw new Error('Watchem: no jAJAX, jQuery or Zepto found!');
            }
            return $.ajax(opt).done(suc).fail(err);
        };
    }(win.jQuery||win.Zepto));

    // Implementation functions:

    function init(files) {
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

        watch(candiates);

        files && watch(files, true);

        // Potentially external (to DOM) resources
        var watchemToo = win.watchemToo;
        if ( watchemToo ) {
            watch(watchemToo, true);
        }

        idx = 0;
        runTo = !watchem.stopped && interval && setTimeout(run, interval);
        initTo = reDOM && setTimeout(init, reDOM);

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
                var url = normPath(u);
                if ( url ) {
                    getState(url, add);
                }
            });
        }
        else {
            Object.keys(files).forEach(function (u) {
                var url = normPath(u);
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

    function start(files) {
        if ( watchem.stopped ) {
            delete watchem.stopped;
            if ( LS ) {
                delete LS.watchemStopped;
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
              , method: method
              , headers: headers
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
          : loc.reload();
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
            a.href = href;
            href = a.href;
            links = links.filter(function (l) {
                var h = l.href;
                return ( h && h.indexOf(href) == 0 );
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
        return a.pathname+a.search.replace(ncReg, '');
    }

    function normPath(url) {
        a.href = url;
        if ( a.hostname != hostname ) {
            return;
        }
        return getPath(a);
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
        if ( !(url in states) ) return request(defMethod, url
          , function (result, status, xhr) {
                var etag = getETag(xhr, result);
                if ( !etag ) {
                    request(altMethod, url
                      , function (result, status, xhr) {
                            var etag = getETag(xhr, result);
                            ondone(url, etag, addURL(url, etag, altMethod));
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
        var console = win.console;
        if ( console && console.debug ) {
            debug = //jshint ignore:line
            watchem.debug =
            console.debug.bind(console);
            return debug.apply(console, arguments);
        }
    }
    
    function load_js(src, clb) {
        var s = document.createElement('SCRIPT');
        s.async = 1;
        s.src = src;
        var b = document.getElementsByTagName('script')[0];
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
        define([], init);
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
