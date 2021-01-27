
const querystring = require('querystring');
const contentType = require('content-type');

const FALLBACK_CONTENT_TYPE = { type: 'text/plain', parameters: { charset: 'utf-8' } };

function parseContentType(headers){
    try{
        var ct = contentType.parse(headers['content-type']);
    }
    catch(err){
        ct = FALLBACK_CONTENT_TYPE;
    }

    ct.textCharset = ct.parameters.charset || 'utf-8';
    ct.originalCharset = ct.parameters.charset;

    return ct;
}

function readStream(){
    var buffer = [];

    this.req.on('data', chunk => buffer.push(chunk));

    this.req.on('close', () => {
        buffer = null;
        this.req.removeAllListeners('aborted');
        this.req.removeAllListeners('data');
        this.req.removeAllListeners('end');
        this.req.removeAllListeners('error');
        this.req.removeAllListeners('close');
    });

    this.req.on('aborted', () =>
        !this.complete && this.req.emit('error', new Error('Request was aborted')));

    return new Promise((resolve, reject) => {

        this.req.on('end', () => {
            !this.complete && resolve(Buffer.concat(buffer));
            this.complete = true;
        });

        this.req.on('error', err => {
            this.log.warn({ req: this.req, err, type: 'request' },
                'Failed to read request body');
            !this.complete && reject(err);
            this.complete = true;
        });
    });
}

async function read(parse){

    if(!this.isStream)
        return this.origBody;

    let out = await readStream.call(this);

    if(typeof parse == 'function')
        try{
            out = parse(out);
        }
        catch(err){
            this.res.badRequest(true);
        }

    return out;
}

module.exports = class RequestBody {

    constructor({ req, res, headers, body }){
        Object.assign(this, parseContentType(headers));
        this.req = req;
        this.res = res;
        this.origBody = body;
        this.complete = false;
        this.length = headers['content-length'];
        this.isStream = req.readable;
    }

    raw(){
        return read.call(this);
    }

    async text(){
        this.res.badType(!this.originalCharset && this.type.slice(0, 4) != 'text');
        return await read.call(this, raw => raw.toString(this.textCharset));
    }

    async urlencoded(){
        this.res.badType(this.type != 'application/x-www-form-urlencoded');
        return await read.call(this, raw =>
            querystring.parse(raw.toString(this.textCharset)));
    }

    async json(){
        this.res.badType(this.type.slice(-4) != 'json');

        return await read.call(this, raw =>
            JSON.parse(raw.toString(this.textCharset)));
    }

    parse(){

        if(this.type.slice(-4) == 'json')
            return this.json();

        if(this.type == 'application/x-www-form-urlencoded')
            return this.urlencoded();

        if(this.originalCharset || this.type.slice(0, 4) == 'text')
            return this.text();

        return this.raw();
    }

}
