/*
 * Set up the statsd-client.
 *
 * Requires the `hostname`. Options currently allows for `port` and `debug` to
 * be set.
 */
function StatsDClient(options) {
    this.options = options || {};
    this._helpers = undefined;

    // Set defaults
    this.options.prefix = this.options.prefix || "";

    // Prefix?
    if (this.options.prefix && this.options.prefix !== "") {
        // Add trailing dot if it's missing
        var p = this.options.prefix;
        this.options.prefix = p[p.length - 1] === '.' ? p : p + ".";
    }

    // Figure out which socket to use
    if (this.options._socket) {
        // Re-use given socket
        this._socket = this.options._socket;
    } else if(this.options.tcp) {
        //User specifically wants a tcp socket
        this._socket = new (require('./TCPSocket'))(this.options);
    } else if (this.options.host && this.options.host.match(/^http(s?):\/\//i)) {
        // Starts with 'http://', then create a HTTP socket
        this._socket = new (require('./HttpSocket'))(this.options);
    } else {
        // Fall back to a UDP ephemeral socket
        this._socket = new (require('./EphemeralSocket'))(this.options);
    }
}

/*
 * Get a "child" client with a sub-prefix.
 */
StatsDClient.prototype.getChildClient = function getChildClient(extraPrefix) {
    return new StatsDClient({
        prefix: this.options.prefix + extraPrefix,
        _socket: this._socket
    });
};

StatsDClient.prototype.send = function send(name, value, unit, tags) {
  var stat = this.options.prefix + name + ":" + value;
  stat += unit ? "|" + unit : "";
  stat += tags && tags.length > 0 ? "|#" + tags.join(",") : "";

  this._socket.send(stat);

  return this;
}

/*
 * gauge(name, value)
 */
StatsDClient.prototype.gauge = function gauge(name, value, tags) {
    return this.send(name, value, "g", tags);
};

StatsDClient.prototype.gaugeDelta = function gaugeDelta(name, delta, tags) {
    var sign = delta >= 0 ? "+" : "-";
    var value = sign + Math.abs(delta);
    return this.send(name, value, "g", tags);
};

/*
 * set(name, value)
 */
StatsDClient.prototype.set = function set(name, value, tags) {
    return this.send(name, value, "s", tags);
};

/*
 * counter(name, delta)
 */
StatsDClient.prototype.counter = function counter(name, delta, tags) {
    return this.send(name, delta, "c", tags);
};

/*
 * increment(name, [delta=1])
 */
StatsDClient.prototype.increment = function increment(name, delta, tags) {
    return this.counter(name, Math.abs(delta === undefined ? 1 : delta), tags);
};

/*
 * decrement(name, [delta=-1])
 */
StatsDClient.prototype.decrement = function decrement(name, delta, tags) {
    return this.counter(name, -1 * Math.abs(delta === undefined ? 1 : delta), tags);
};

/*
 * timing(name, date-object | ms)
 */
StatsDClient.prototype.timing = function timing(name, time, tags) {
    // Date-object or integer?
    var t = time instanceof Date ? new Date() - time : time;

    return this.send(name, t, "ms", tags);
};

/*
 * histogram(name, value)
 */
StatsDClient.prototype.histogram = function histogram(name, value, tags) {
    return this.send(name, value, "h", tags);
};

/*
 * Send raw data to the underlying socket. Useful for dealing with custom
 * statsd-extensions in a pinch.
 */
StatsDClient.prototype.raw = function raw(rawData) {
    this._socket.send(rawData);

    return this;
};

/*
 * Close the socket, if in use and cancel the interval-check, if running.
 */
StatsDClient.prototype.close = function close() {
    this._socket.close();

    return this;
};

/*
 * Return an object with available helpers.
 */
StatsDClient.prototype.__defineGetter__('helpers', function () {
    if (!(this._helpers)) {
        var helpers = {},
            that = this,
            files = require('fs').readdirSync(__dirname + '/helpers');

        files.forEach(function (filename) {
            if (/\.js$/.test(filename) && filename !== 'index.js') {
                var name = filename.replace(/\.js$/, '');
                helpers[name] = require('./helpers/' + filename)(that);
            }
        });
        this._helpers = helpers;
    }

    return this._helpers;
});

module.exports = StatsDClient;
