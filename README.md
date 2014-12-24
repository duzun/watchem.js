watchem.js
==========

##### @version 0.2.1

A very simple script to watch for `.js` & `.css` files present in DOM
over AJAX and reload the page/CSS when changes are detected.

### Usage

At the boottom of you `<body>`, after all `<script>` tags add this:

```html
<script src="watchem.js"></script>
```

You can add more files to watchem or exclude some by:

```javascript
var watchemToo = window.watchemToo || (window.watchemToo = {});
watchemToo['/assets/someModule.js'] = true; // watch
watchemToo['/assets/jquery.js']  = false; // don't watch
```

### How it works

It makes `HEAD` requests to the server in the specified interval and compares
`ETag` or `Last-Modified` header with the stored value.

If server does not return `ETag` or `Last-Modified` header, it makes
`GET` requests (which are more expensive) and compares the contents of the file.

### When should I use it

I find it best suited for TDD / BDD.

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
```javascript
window.jajax = function (opt, suc, err) {
    return jQuery.ajax(opt).done(suc).fail(err)
}
```

### Browser Compatibility

I've tested it on **Google Chrome 39** so far. 
I don't know when I would need to use it in other browser, but PRs are welcome.

