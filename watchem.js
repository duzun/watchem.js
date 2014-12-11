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
 *  Depends on https://github.com/duzun/jAJAX - could be easily replaced.
 *
 *
 *  @version 0.1.0
 *  @license MIT
 *  @author DUzun.Me
 *
 */

(function (win, undefined) {
    // Settings
    var interval    = 500 // Recheck interval
    ,   reDOM       = 5e3 // Recheck DOM interval
    ,   selfWatch   = true // Watch document change
    ,   defMethod   = 'HEAD'
    ,   altMethod   = 'GET'
    ;

    // Local variables
    var slice       = [].slice
    ,   document    = win.document
    ,   loc         = win.location
    ,   hostname    = loc.hostname
    ,   a           = document.createElement('a')
    ,   states      = {}
    ,   types       = {}
    ,   interactive = {}
    ,   list        = []
    ,   idx
    ,   runTo
    ,   initTo
    ;

    // Implementation functions
    function init() {
        runTo && clearTimeout(runTo);

        a.href = loc.href;

        var candiates = slice.call(document.querySelectorAll('script[src]')).map(filtSrc);
        if ( selfWatch ) {
            candiates.push(loc.href);
        }

        function add(url, etag) {
            url in states || win.console && console.log('tracking ', url);
            states[url] = etag ;
            list.push(url);
        }

        // list = [];

        candiates.forEach(function (url) {
            if ( url in states ) {

            }
            else jajax(
              {
                url: url
                , type: defMethod
              }
              , function (result, status, xhr) {
                  var etag = getETag(xhr, result);
                  if ( !etag ) {
                    jajax(
                      {
                        url: url
                        , type: altMethod
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
        if ( interval ) {
          runTo = setTimeout(run, interval);
        }
        if ( reDOM ) {
          initTo && clearTimeout(initTo);
          initTo = setTimeout(init, reDOM);
        }

        return states;
    }

    function run() {
        var i = idx
        ,   url = list[i]
        ,   type = types[url] || defMethod
        ;
        // console.log(type + ':'+idx+':'+url); // for debug
        jajax(
          {
            url: url
            , type: type
          }
          , function (result, status, xhr) {
              var etag = getETag(xhr, result);
              if ( states[url] != etag ) {
                win.console && console.log('change detected in ', url);
                loc.reload();
              }
              else if ( idx == i ) {
                ++idx;
                if ( idx >= list.length ) {
                  idx = 0;
                  runTo = interval && setTimeout(run, interval);
                }
                else {
                  run();
                }
              }
              else {
                  runTo = interval && setTimeout(run, interval);
              }
          }
          , function (xhr, error) {
              loc.reload();
          }
        );
    }

    function filtSrc(l) {
        var href = l.src;
        if ( !href ) return undefined;
        a.href = href;
        if ( a.hostname != hostname ) return undefined;
        var pathname = a.pathname;
        return '.css.js'.indexOf(pathname.split('.').pop()) > -1 && pathname.indexOf('/jasmine/lib/') == -1
            ? pathname
            : undefined;
    }

    function getETag(xhr, result) {
        return xhr && (xhr.getResponseHeader('ETag') || xhr.getResponseHeader('Last-Modified')) || result
    }

    // AMD
    if ( typeof define == 'function' && define.amd) {
        define([], init)
    }
    else {
      // Init
      document.addEventListener('DOMContentLoaded', init);
      initTo = setTimeout(init, 3e3); // in case DOMContentLoaded, retrigger init again, with a delay
    }

}
(this));