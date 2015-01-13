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
 *  @version 0.3.1
 *  @license MIT
 *  @author Dumitru Uzun (DUzun.Me)
 *
 */

(function (win, undefined) {
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
    ,   list     = []
    ,   extern   = {}
    ,   states   = {}
    ,   types    = {}
    ,   slice    = list.slice
    ,   a        = document.createElement('a')
    ,   ncReg    = new RegExp('(\\?|\\&)'+noCacheParam+'=[^\\&]+')
    ,   idx
    ,   runTo
    ,   initTo
    ;

    // Our AJAX method: jajax(options, success, error)
    var jajax = win.jajax || (function ($) {
        return function (opt, suc, err) {
            return $.ajax(opt).done(suc).fail(err)
        }
    }(win.jQuery||win.Zepto));


    // Implementation functions:

    function init() {
        runTo  && clearTimeout(runTo);
        initTo && clearTimeout(initTo);

        a.href = loc.href;

        var candiates = getScripts().map(filtSrc)
              .filter(function (i) { return i})
        ;
        if ( cssWatch ) {
            candiates = candiates.concat(
              getStyleSheets().map(filtSrc)
                  .filter(function (i) { return i})
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
            if ( !(url in states) ) jajax(
              {
                url: getNCUrl(url, defMethod)
                , type: defMethod
                // , crossDomain: true // removes X-Requested-With header
                , headers: headers
              }
              , function (result, status, xhr) {
                  var etag = getETag(xhr, result);
                  if ( !etag ) {
                    jajax(
                      {
                        url: getNCUrl(url, altMethod)
                        , type: altMethod
                        , headers: headers
                      }
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
        runTo = interval && setTimeout(run, interval);
        initTo = reDOM && setTimeout(init, reDOM);

        return states;
    }


    // Loop through the list of watched resources, asynchronously.
    function run() {
        var i = idx
        ,   url = list[i]
        ,   type = types[url] || defMethod
        ;
        // debug(type + ':'+idx+':'+url); // for debug
        jajax(
          {
            url: getNCUrl(url, type)
            , type: type
            , headers: headers
          }
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
              runTo && clearTimeout(runTo);
              runTo = _interval && setTimeout(run, _interval);
          }
          , function (xhr, error) {
              reload();
          }
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
        return win.console && console.debug && console.debug.apply(console, arguments);
    }

    // AMD
    if ( typeof define == 'function' && define.amd) {
        define([], init)
    }
    else {
      // Init with delay
      initTo = setTimeout(init, interval);
      // Catch new stuff on DOMContentLoaded
      document.addEventListener('DOMContentLoaded', init);
    }



}
(this));