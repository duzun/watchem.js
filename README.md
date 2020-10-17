watchem.js
==========

##### @version 0.7.0

A very simple script to watch for `.js` &amp; `.css` files present in DOM
over AJAX and reload the page/CSS when changes are detected.

### Usage

Just throw the `watchem.min.js` into your HTML and it starts watching your assets.
That simple!

At the bottom of you `<body>`, after all `<script>` tags add this:

~~~<script src="https://cdn.duzun.me/js/watchem.min.js" async></script>~~~

```html
<script src="https://unpkg.com/watchem.js" async></script>
```

And that should be enough to automatically watch resources (JS & CSS & the page) 
of this page.

For advanced configuration, you can call `watchem.setOption(name, value)`.

When `watchem` is loaded, it invokes `window.watchemInit(watchem)`:

```js
window.watchemInit = (watchem) => {
    // These are the defaults:
    watchem.setOption({
        interval: 500,  // Recheck/ping interval
        reDOM:    5e3,  // Recheck DOM interval

        wDoc:  true, // Watch this document change
        wCSS:  true, // Watch CSS change
        wJS:   true, // Watch JS change
        noMin: true, // Ignore .min.js or .min.css

        hostAlias: {}, // eg. { 'cdn.example.com': 'example.com', 'www.example.com': 'example.com' }

        wHosts: [location.hostname], // Automatically watch JS & CSS only for these hostnames
        // !!! CORS restrictions apply !!!

        // Ping request methods
        defMethod: 'HEAD',
        altMethod: 'GET',

        headers: { 'X-Requested-With': 'Watchem' },
    });
};
```

You can stop the watcher from console

```js
watchem.stop(); // stops the watcher and remembers the state in localStorage
```

and start it later

```js
watchem.start();
```

You can add more files to watchem or exclude some by:

```js
var watchemToo = {
    '/assets/someModule.js': true,  // watch
    '/assets/jquery.js':     false, // don't watch
};

// Auto-invokes watchem.watch(window.watchemToo, true); at options.reDOM interval
window.watchemToo = watchemToo;
// or
watchem.watch(watchemToo, true);

// or

// External (to DOM) resources have lower priority (just a delay in watching)
watchem.watch(['/external/to/dom/file.js'], true);
```

### How it works

It makes `HEAD` (`options.defMethod`) requests to the server in the specified interval and compares
`ETag` or `Last-Modified` and `Content-Length` and `Content-Type` header with the stored value.

If server does not return any of the tracked headers, it makes
`GET` requests (`options.altMethod`) and compares the contents of the file.

Note that a `GET` request is more expensive than `HEAD`.

### When should I use it

I find it best suited for TDD / BDD and for designing using HTML & CSS.

I've built this script to automatically run [Jasmine](https://jasmine.github.io/)
specs inside a Chrome Extension on source files change
(do you know about [Karma](https://karma-runner.github.io/)?),
but it can be successfully used for any web app.

For advanced stuff I recommend [BrowserSync](https://browsersync.io/) (requires Node.js).

### Dependencies

Requires one of:

- [jAJAX](https://github.com/duzun/jAJAX)
- or [jQuery v1.5+](https://api.jquery.com/jquery.ajax/)
- or [Zepto v1.1+](http://zeptojs.com/#$.ajax) "callbacks" and "deferred" modules loaded
- or a custom method named `jajax` that looks like this one:

```js
window.jajax = (opt, suc, err) => {
    return jQuery.ajax(opt).done(suc).fail(err);
};
```

If none of the above is found, it will try to load [unpkg.com/jajax.js](https://unpkg.com/jajax.js)
automatically.

### Browser Compatibility

I've tested it on **Google Chrome 39-47**, **Safari 5.1-9.0** and **Firefox 36-41** so far.
I don't know when I would need to use it in other browser, but PRs are welcome.

### Alternatives

- [Live.js](http://livejs.com/)
- [BrowserSync](https://browsersync.io/) (requires Node.js)
- [Live Reload](http://livereload.com/) (native app)
- [NppSync](https://github.com/duzun/NppSync) (for Notepad++ lovers)
