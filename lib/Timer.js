class Timer {
    constructor(t, fn) {
        this.fn = fn;
        this.timeout = t;

        this.timer = setTimeout(this.fn, this.timeout);
    }

    reset() {
        clearTimeout(this.timer);
        this.timer = setTimeout(this.fn, this.timeout);
    }
}

exports.createTimer = (time, onTimeout) => new Timer(time, onTimeout);
