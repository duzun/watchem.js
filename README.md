watchem.js
==========

##### @version 0.4.0

A very simple script to watch for `.js` & `.css` files present in DOM
over AJAX and reload the page/CSS when changes are detected.

### Usage

Just through the `watchem.min.js` into your HTML and it starts watching your assets.
That simple!


At the boottom of you `<body>`, after all `<script>` tags add this:

```html
<script src="watchem.min.js" async></script>
```


You can stop the watcher from console

```js
watchem.stop(); // stops the wather and remembers the state in localStorage
```

and start it later

```js
watchem.start();
```


You can add more files to watchem or exclude some by:

```js
var watchemToo = window.watchemToo || (window.watchemToo = {});
watchemToo['/assets/someModule.js'] = true; // watch
watchemToo['/assets/jquery.js']  = false; // don't watch
```

### How it works

It makes `HEAD` requests to the server in the specified interval and compares
`ETag` or `Last-Modified` and `Content-Length` and `Content-Type` header with the stored value.

If server does not return any of the tracked headers, it makes
`GET` requests (which are more expensive) and compares the contents of the file.

### When should I use it

I find it best suited for TDD / BDD and for designing using HTML & CSS.

I've built this script to automatically run [Jasmine](http://jasmine.github.io/)
specs inside a Chrome Extension on source files change
(do you know about [Karma](http://karma-runner.github.io/)?),
but it can be successfully used for any web app.

For advanced stuff I recomend [BrowserSync](http://www.browsersync.io/) (requires Node.js).

### Dependencies

Requires one of:

- [jAJAX](https://github.com/duzun/jAJAX)
- or [jQuery v1.5+](http://api.jquery.com/jquery.ajax/)
- or [Zepto v1.1+](http://zeptojs.com/#$.ajax) "callbacks" and "deferred" modules loaded
- or a custom method named `jajax` that looks like this one:
```js
window.jajax = function (opt, suc, err) {
    return jQuery.ajax(opt).done(suc).fail(err)
}
```

### Browser Compatibility

I've tested it on **Google Chrome 39-47**, **Safari 5.1-9.0** and **Firefox 36-41** so far.
I don't know when I would need to use it in other browser, but PRs are welcome.

### Alternatives

- [Live.js](http://www.livejs.com/)
- [BrowserSync](http://www.browsersync.io/) (requires Node.js)
- [Live Reload](http://livereload.com/) (native app)
- [NppSync](https://github.com/duzun/NppSync) (for Notepad++ lovers)
