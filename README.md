watchem.js
==========

##### @version 0.1.1

A very simple, one file script to watches for .js files present in DOM
over AJAX and reload the page when changes are detected.

### How it works

It makes HEAD requests to the server in the specified interval and compares
ETag or Last-Modified headers with the stored value.

If server does not return ETag or Last-Modified headers, it makes
GET requests (which are more expensive) and compares the contents of the file.

### When should I use it

I find it best suited for TDD / BDD.

I've built this script to automatically run [Jasmine](http://jasmine.github.io/) 
test inside a Chrome Extension on source files change (do you know about [Karma](http://karma-runner.github.io/)?), 
but it can be successfully used for any web app.

For advanced stuff I recomend [BrowserSync](http://www.browsersync.io/) (requires Node.js).

### Dependencies

Depends on [jAJAX](https://github.com/duzun/jAJAX), but could be easily replaced by jQuery.ajax().
