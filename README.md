# [Nodecaf](https://gitlab.com/GCSBOSS/nodecaf)

> Docs for version v0.11.x.

Nodecaf is a light framework for developing RESTful Apps in a quick and convenient manner.
Using Nodecaf you'll get:
- Familiar middleware style routes declaration
- Useful [handler arguments](#handlers-args).
- Built-in [settings file support](#settings-file) with layering.
- [Logging functions](#logging).
- Seamless support for [async functions as route handlers](#async-handlers).
- [Uncaught exceptions](#error-handling) in routes always produce proper REST
  responses.
- Built-in [assertions for readable RESTful error handling](#rest-assertions).
- Function to [expose global objects](#expose-globals) to all routes (eg.:
  database connections).
- Shortcut for [CORS Settings](#cors) on all routes.
- Functions to [describe your API](#api-description) making your code the main
  source of truth.
- Helpful [command line interface](https://gitlab.com/GCSBOSS/nodecaf-cli).

## Get Started

1. Install the cli utilities: `npm i -P -g nodecaf-cli`.
2. Create a skelleton project with: `nodecaf init my-project`.
3. Add your globals in `lib/main.js`

```js
const Nodecaf = require('nodecaf');
const api = require('./api');

module.exports = () => new Nodecaf({

    // Load your routes and API definitions.
    api,

    // Perform your server initialization logic.
    async startup({ conf, log, global }){

    },

    // Perform your server finalization logic.
    async shutdown({ conf, log, global }){

    }
});
```

4. Add your routes in `lib/api.js`

```js
module.exports = function({ post, get, del, head, patch, put }){

    // Define routes and a list of middleware functions (async or regular no matter).
    get('/foo/:f/bar/:b', Foo.read, Bar.read);
    post('/foo/:f/bar', Foo.read, Bar.write);
    // ...
};
```

5. In your app root directory run with: `nodecaf run .`


## How to Run my App

There are a few supported ways of running your app dependng on the type of
environment you are targeting.

### Running on development machine

1. You should use the CLI (`npm i -P -g nodecaf-cli`)
2. Run: `nodecaf run path/to/your/app`
3. Optionally pass config files with `-c path/to/config`
4. Optionally enable live reload with `-r`

### Running on Docker for development

- Build the auto-generated `Dockerfile`
- Bind the port you are going to listen to
- Create a bind mount to your config files
- Reference your config files in the `command`
- Create a bind mount to your app directory targeting `/app` inside the container
- Run the container

Or use this example compose configuration:

```yml
my-app:
  build: ./my-app
  command: -c /my-conf.toml
  ports:
    - 80:8080
  volumes:
    - ./my-conf.toml:/my-conf.toml
    - ./my-app:/app
  environment:
    NODE_ENV: ''
```

### Running on Docker for production
- Build and run the auto-generated `Dockerfile` in the same fashion as development
- You should NOT setup a volume in production so you just use the source code baked in the image
- Ensure all configuration files referenced in the `command` are accessible inside the container
- Run the container

### Running as a node module

Your Nodecaf app is exported as a regular node module, so it can run as a dependency in another project

```js
let myApp = require('my-app');

(async function(){

    let app = myApp();
    await app.start();

    let res = await app.trigger('/');

    await app.stop();
})();
```

## Reporting Bugs **or Vulnerabilities**
If you have found any problems with Nodecaf, please:

1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe what happened and how.
3. Also in the issue text, reference the label `~bug` or `~security`.

We will make sure to take a look when time allows us.

## Proposing Features
If you wish to get that awesome feature or have some advice for us, please:
1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe your ideas.
3. Also in the issue text, reference the label `~proposal`.

## Contributing
If you have spotted any enhancements to be made and is willing to get your hands
dirty about it, fork us and
[submit your merge request](https://gitlab.com/GCSBOSS/nodecaf/merge_requests/new)
so we can collaborate effectively.

- For coding style, we provide an [ESLint](https://eslint.org/) configuration
  file in the root of the repository.
- All commits are submit to SAST and Dependency Scanning as well as Code Quality
  analisys, so expect to be boarded on your MRs.

## Manual
Formerly based on Express, Nodecaf preserves the same interface for defining routes
through middleware chains. Check out how to use all the awesome goodies Nodecaf introduces.

### Handler Args

In this manual we address as **handler args** the keys in the object passed as
the only argument of any route handler function. The code below shows all
handler args exposed by Nodecaf:

```js
function({ req, res, next, query, params, body, flash, conf, log, headers }){
    // Do your stuff.
}
```

Quick reference:

- `req`, `res`, `next`: The good old parameters used regularly in middleware-like frameworks.
- `query`, `parameters`, `body`, `headers`: Shortcuts to the homonymous properties of `req`.
  They contain respectively the query string, the URL parameters, and the request
  body data.
- `flash`: Is an object where you can store arbitrary values. Keys inserted in this
  object are preserved for the lifetime of a request and can be accessed in all
  handlers of a route chain.
- `conf`: This object contains the entire
  [application configuration data](#settings-file).
- `log`: A logger instance. Use it to [log events](#logging) of
  your application.
- Also all keys of the [globally exposed object](#expose-globals) are available
  as handler args for all routes.

### Settings File

Nodecaf allow you to read a configuration file and use it's data in all routes
and server configuration.

Use this feature to manage:
- external services data such as database credentials
- Nodecaf settings such as cors and logging
- Your own server application settings for your users

Suported config formats: **TOML**, **YAML**, **JSON**, **CSON**

> Check out how to [generate a project with configuration file already plugged in](#init-project)

To load a config file in your app, use the `-c` flag through the CLI pointing
to your conf file path: `nodecaf run -c my/conf/path.toml my/app`

You can use the config data through [it's handler arg](#handler-args) in
all route handlers as follows:

```js
post('/foo', function({ conf }){
    console.log(conf.key); //=> 'value'
});
```

Config data can also be passed as an object to the app constructor in `lib/main.js`:

```js
module.exports = () => new Nodecaf({ conf: { key: 'value' } });
```

Or a file path if you want to have a fixed config file for setting defaults or any other reason:

```js
module.exports = () => new Nodecaf({ conf: __dirname + '/default.toml' });
```

#### Layered Configs

You can also use the `app.setup` to add a given configuration
file or object on top of the current one as follows:

```js
app.setup('/path/to/settings.toml');

app.setup('/path/to/settings.yaml');

app.setup({ key: 'value' });

app.setup({ key: 'new-value', foo: 'bar' });
```

Layering is useful, for example, to keep a **default** settings file in your server
source code to be overwritten by your user's.

### Logging

Nodecaf logs events to stdout by default where each line of the ouput is a JSON object.
The log entries will have some default predefined values like pid, hostname etc...
In your route handlers, use the functions available in the `log` object as follows:

```js
function({ log }){
    log.info('hi');
    log.warn({ lang: 'fr' }, 'au revoir');
    log.fatal({ err: new Error() }, 'The error code is %d', 1234);
}
```

Below is described the signature of the available logging methods.

- Method Name: one of the available log levels (`debug`, `info`, `warn`, `error`, `fatal`)
- First argument (optional): An object whose keys will be injected in the final entry.
- Second argument: A message to be the main line of the log. May contain printf-like replacements (%d, %s...)
- Remaning arguments: Will be inserted into the message (printf-like)

Nodecaf will automatically log some useful server events as described in the
table below:

| Type | Level | Event |
|-------|-------|-------|
| error after headers sent | warn | An error happened inside a route after the headers were already sent |
| route | error | An error happened inside a route and was not caught |
| route | warn | next() used after stack has ended |
| crash | fatal | An error happened that crashed the server process |
| request | debug | A request has arrived |
| response | debug | A response has been sent |
| app | debug | The application is starting up |
| app | info | The application has started |
| app | info | The application has stopped |
| app | info | The application configuration has been reloaded |

Additionally, you can filter log entries by level and type with the following
settings:

```toml
[log]
level = 'warn' # Only produce log entries with level 'warn' or higher ('error' & 'fatal')
type = 'my-type' # Only produce log entries with type matching exactly 'my-type'
```
You can disable logging entirely for a given app by setting it to `false` in the config

```toml
log = false
```

### Async Handlers

Nodecaf brings the useful feature of accepting async functions as route handlers
with zero configuration. All rejections/error within your async handler will be
gracefully handled by the same routine the deals with regular functions. You will
be able to avoid callback hell without creating bogus adapters for your promises.

```js
get('/my/thing',
    function({ res, next }){
        res.send('My regular function works!');
        next();
    },
    async function({ res }){
        await myAsyncThing();
        res.end('My async function works too!');s
    }
);
```

### Error Handling

In Nodecaf, any uncaught synchronous error happening inside route handler will be
automatically converted into a harmless RESTful 500.

```js
post('/my/thing', function(){
    throw new Error('Should respond with a 500');
});
```

To support the callback error pattern, use the `res.error()` function arg. This
function will stop the middleware chain from being executed any further.

```js
const fs = require('fs');

post('/my/thing', function({ res }){
    fs.readFile('./my/file', 'utf8', function(err, contents){
        if(err)
            return res.error(err);
        res.end(contents);
    });
});
```

To use other HTTP status codes you can send an integer in the first parameter of
`res.error()`.

```js
post('/my/thing', function({ error }){
    try{
        doThing();
    }
    catch(e){
        error(404, 'Optional message for the response');
    }
});
```

### REST Assertions

Nodecaf provides you with an assertion module containing functions to generate
the most common REST outputs based on some condition. Check an example to
trigger a 404 in case a database record doesn't exist.

```js
get('/my/thing/:id', function({ params, db, res }){
    let thing = await db.getById(params.id);
    res.notFound(!thing, 'thing not found');

    doStuff();
});
```

If the record is not found, the `res.notfound()` call will stop the route execution right
away and generate a [RESTful `NotFound` error](#error-handling).

Along with `notFound`, the following assertions with similar behavior are provided:

| Method | Status Code |
|--------|-------------|
| `badRequest`   | 400 |
| `unauthorized` | 401 |
| `forbidden`    | 403 |
| `notFound`     | 404 |
| `conflict`     | 409 |
| `gone`         | 410 |
| `badType`      | 415 |

### Expose Globals

Nodecaf makes it simple to share global objects (eg.: database connections,
instanced libraries) across all route handlers. In your `lib/main.js` you can
expose an object of which all keys will become handler args.

```js
module.exports = () => new Nodecaf({
    startup({ global }){
        global.db = myDbConnection;
        global.libX = new LibXInstance();
    }    
});
```

Then in all routes you can:

```js
get('/my/thing', function({ db, libX }){
    // use your global stuff
});
```

### CORS

Nodecaf provides a setting to enable permissive CORS on all routes. Defaults to
disabled. In your conf file:

```toml
cors = true
cors = 'my://origin'
cors = [ 'my://origin1', 'my://origin2' ]
```

Setup the cors according to the [popular CORS Express middleware](https://github.com/expressjs/cors#configuration-options).

### API Description

Nodecaf allows you to descibe your api and it's functionality, effectively turning
your code in the single source of truth. The described API can later be used to
[generate](https://gitlab.com/GCSBOSS/nodecaf-cli#open-api-support) an
[Open API](https://www.openapis.org/) compatible
document.

In `lib/api.js` describe your API as whole through the `info` parameter:

```js
module.exports = function({ get, info }){

    info({
        description: 'My awesome API that foos the bars and bazes the bahs'
    });

    get('/my/thing/:id', function(){
        // ...
    });
}
```

The `info` funciton expects an object argument on the OpenAPI
[Info Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#infoObject)
format. If not defined the `title` and `version` keys will default to your server's.

Describe your API endpoints by chaining a `desc` method to each route definition.

```js
module.exports = function({ get }){

    get('/my/thing/:id', function(){
        // ...
    }).desc('Retrieves a thing from the database\n' +
        `Searches the database for the thing with the given :id. Returns a
        NotFound error in case no thing is found.`);
}
```

The `desc` method takes a single string argument and uses it's first line (before `\n`)
to set the
[Operation object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#operationObject)'s
`summary` property and the rest of the text to set the `description` (CommonMark).

### Other Settings

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `app.conf.delay` | Integer | Milliseconds to wait before actually starting the app | `0` |
| `app.conf.port` | Integer | Port for the web server to listen (also exposed as user conf) | `80` or `443` |
| `app.conf.cookie.secret` | String | A secure random string to be used for signing cookies | none |
| `opts.name` | String | Manually set application name used in various places | `package.json`s |
| `opts.version` | String | Manually set application version | `package.json`s |
| `opts.shouldParseBody` | Boolean | Wether supported request body types should be parsed | `true` |
| `opts.alwaysRebuildAPI` | Boolean | Wether the API should be rebuilt dynamically for every start or setup operation | `false` |
