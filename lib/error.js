
class HTTPError extends Error {
    constructor(status, message, type) {
        super(message);
        this.status = status;
        this.name = 'HTTPError';
        this.type = type;
    }
}

function anythingToError(thing){
    if(thing instanceof HTTPError)
        return thing;
    if(thing instanceof Error)
        return new HTTPError(500, thing.message, 'text');
    if(thing instanceof Buffer)
        return new HTTPError(500, thing, 'binary');
    if(typeof thing == 'object')
        return new HTTPError(500, JSON.stringify(thing), 'json');
    return new HTTPError(500, String(thing), 'text');
}

// This function is called when throw/rejection comes from route code (Except callbacks)
// and from res.error() when calling it with an error
function handleError(err, res){
    res.failed = true;

    // Need to keep the original error stack and message for logging.
    res.err = err;

    err = anythingToError(err);

    if(err.status < 500)
        return;

    res.log.error({ type: 'route', err: res.err });

    if(!res.finished)
        res.status(err.status).type(err.type).end(
            /*istanbul ignore next */
            process.env.NODE_ENV !== 'production' ? err.message : '');
}

module.exports = { handleError, HTTPError };
