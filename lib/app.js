const
    // os = require('os'),
    fs = require('fs'),
    // cors = require('cors'),
    http = require('http'),
    https = require('https'),
    Confort = require('confort')
    // compression = require('compression'),
    // cookieParser = require('cookie-parser'),
    // fileUpload = require('express-fileupload')
    ;

// const { defaultErrorHandler, addRoute } = require('./route-adapter');
// const { parseTypes } = require('./parse-types');
// const errors = require('./errors');
const Logger = require('./logger');
const Router = require('./router');
//const WebSocket = require('./ws');
const { METHODS } = require('http');

const noop = function(){};
noop.noop = true;

function findPkgInfo(){
    try{
        return require(module.parent.parent.path + '/../package.json');
    }
    catch(e){
        /* istanbul ignore next */
        return { name: 'Untitled', version: '0.0.0' };
    }
}

module.exports = class Nodecaf {

    // TODO no api handler

    constructor(conf){
        let { name, version } = findPkgInfo();
        this._global = {};
        this._startup = this._shutdown = this._api = noop;
        this._confort = new Confort();
        this._router = new Router(this);

        // TODO sha1 of host+time+name to identify app

        // Generate HTTP verb shortcut route methods
        this._routeProxy = METHODS.reduce( (o, m) =>
            ({ ...o, [m.toLowerCase()]: this._router.addRoute.bind(this._router, m.toLowerCase()) }), {});

        // Needed because it's not possible to call a function called 'delete'
        this._routeProxy.del = this._router.addRoute.bind(this._router, 'delete');

        //  TODO Add ws router proxy

        this.conf = this._confort.object;
        this.shouldParseBody = true;
        this.cookieSecret = '';
        this.name = name;
        this.version = version;
        this.running = false;
        this.stopped = Promise.resolve(true);

        // TODO on error events
        this.setup(conf);
    }

    setup(objectOrPath){
        this._confort.addLayer(objectOrPath || {});
        this.conf = this._confort.object;

        // TODO parsers
        // let formFileDir = this.conf.formFileDir || os.tmpdir();
        // this.parsers = {
        //     'application/json': express.json({ strict: false }),
        //     'application/x-www-form-urlencoded': express.urlencoded({ extended: true }),
        //     'multipart/form-data': fileUpload({ useTempFiles: true, tempFileDir: formFileDir })
        // };

        this.log = new Logger(this);

        this._ssl = this.conf.ssl ? {
            key: fs.readFileSync(this.conf.ssl.key),
            cert: fs.readFileSync(this.conf.ssl.cert)
        } : undefined;

        this.conf.port = this.conf.port || (this._ssl ? 443 : 80);

        if(this.alwaysRebuildAPI)
            this._api(this._routeProxy);
    }

    startup(handler){
        if(typeof handler != 'function')
            throw new TypeError('Startup handler must be a function');
        this._startup = handler;
    }

    shutdown(handler){
        if(typeof handler != 'function')
            throw new TypeError('Shutdown handler must be a function');
        this._shutdown = handler;
    }

    api(builder){
        if(typeof builder != 'function')
            throw new TypeError('API Builder must be a function');
        this._api = builder;
        this._api(this._routeProxy);
    }

    global(object){
        this._global = object;
    }

    // TODO maybe move api build to constructor

    async start(){
        if(this.running)
            return false;

        await this.stopped;

        let started;
        this.running = new Promise(resolve => started = resolve);

        if(this.conf.delay > 0)
            await new Promise(done => setTimeout(done, this.conf.delay));

        if(this.alwaysRebuildAPI)
            this._api(this._routeProxy);

        if(!this._startup.noop)
            this.log.debug({ type: 'server' }, 'Starting up %s...', this.name);

        await this._startup(this);

        let handler = this._router.handle.bind(this._router);
        this._server = this._ssl
            ? https.createServer(this._ssl, handler)
            : http.createServer(handler);

        // TODO WS and Router? & Server
        // if(this._wsRouter)
        //     this._wss = WebSocket.start(this);

        await new Promise(done => this._server.listen(this.conf.port, done));

        this.log.info({ type: 'server' },
            '%s v%s is ready on port %s', this.name, this.version, this.conf.port);

        started(true);
        this.stopped = false;
        return this;
    }

    async stop(){
        if(this.stopped)
            return false;

        await this.running;

        let finished;
        this.stopped = new Promise(resolve => finished = resolve);

        // TODO WS and Router? & Server
        // if(this.wss)
        //     WebSocket.close(this.wss);

        await new Promise(done => this._server.close(done));

        await this._shutdown(this);

        this.log.info({ type: 'server' }, 'Stopped');

        finished(true);
        this.running = false;
    }

    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.debug({ type: 'server' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

}

/* CHANGES SO FAR

- log class -> type
- Log name -> app
- Removed Express
- Nice Exceptions
- Logger Auto-parse err, app, res, req (TODO)
- UpTime entrypoint (TODO)
- Health entrypoint (TODO)
- Removed 'port' attr
- Change main class to 'Nodecaf'
- 4xx errors won't spit default body anymore
- expose() to global()
- PID 1 omitted from log entries
- Added res.type()
- Added res.text()
- Entire assertions usage
*/



// // TODO ALL OF THIS
// function setupAPI(){
//     // this => app
//     this.express.use(compression());
//     this.express.use(cookieParser(this.cookieSecret));
//     this.express.use(cors(this.conf.cors));
//     this.express.use(defaultErrorHandler.bind(this));
// }
//
// /*                                                                            o\
//     Application Server to be instanced by users. Contain the basic REST
//     server/service funcionallity.
// \o                                                                            */
// module.exports = class AppServer {
//
//     /*                                                                        o\
//         Define a whitelist of accepted request body mime-types for all routes
//         in the app. Effectively blocks all requests whose mime-type is not one
//         of @types. May be overriden by route specific accepts.
//     \o                                                                        */
//     accept(types){
//         this.accepts = parseTypes(types);
//     }
//
//
// }