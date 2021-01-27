const assert = require('assert');

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80'

const { get, context, request } = require('muhb');
let base = context(LOCAL_HOST);

const Nodecaf = require('../lib/main');

describe('Nodecaf', () => {

    describe('constructor', () => {

        it('Should fail when Options is not an object', () => {
            assert.throws( () => new Nodecaf(false), /Options/ );
        });

        it('Should fail when API builder is not a function', () => {
            assert.throws( () => new Nodecaf({ api: 3 }), /API/ );
        });

        it('Should execute the API Builder passing the method funcs', done => {
            new Nodecaf({
                api(funcs){
                    assert.strictEqual(typeof funcs, 'object');
                    done();
                }
            });
        });

        it('Should allow registering routes', async () => {
            let app = new Nodecaf({
                conf: { port: 80 },
                api({ post, del, patch }){
                    post('/foo', ({ res }) => res.status(500).end());
                    assert.strictEqual(typeof del, 'function');
                    assert.strictEqual(typeof patch, 'function');
                }
            });
            await app.start();
            let { assert: { status } } = await base.post('foo');
            status.is(500);
            await app.stop();
        });

        it('Should preserve flash vars across handlers in a route', async function(){
            this.timeout(4000);
            let app = new Nodecaf({
                conf: { port: 80 },
                api({ get }){
                    get('/bar',
                        ({ flash, next }) => { flash.foo = 'bar'; next(); },
                        ({ flash, res }) => {
                            res.type('text/plain');
                            res.end(flash.foo);
                        });
                }
            });
            await app.start();
            let { assert: { body } } = await base.get('bar');
            body.exactly('bar');
            await app.stop();
        });

        it('Should NOT bulid the API right away if setup so [opts.alwaysRebuildAPI]', () => {
            let app = new Nodecaf({
                alwaysRebuildAPI: true,
                api({ get }){
                    get('/foobar', ({ res }) => res.end());
                }
            });
            assert(!app._api);
        });

        it('Should store any settings sent', () => {
            let app = new Nodecaf({ conf: { key: 'value' } });
            assert.strictEqual(app.conf.key, 'value');
        });

        it('Should fail when startup handler is not a function', () => {
            assert.throws( () => new Nodecaf({ startup: 3 }), /function/ );
        });

        it('Should fail when shutdown handler is not a function', () => {
            assert.throws( () => new Nodecaf({ shutdown: 3 }), /function/ );
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new Nodecaf({ conf: { port: 80 } });
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(404);
            await app.stop();
        });

        it('Should prevent starting a running server', async () => {
            let app = new Nodecaf();
            await app.start();
            assert.strictEqual(await app.start(), 'running');
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new Nodecaf({ conf: { port: 8765 } });
            await app.start();
            let { assert } = await get('http://127.0.0.1:8765/');
            assert.status.is(404);
            await app.stop();
        });

        it('Should trigger before start event', async () => {
            let done = false;
            let app = new Nodecaf({ startup: () => done = true });
            await app.start();
            assert(done);
            await app.stop();
        });

        it('Should rebuild the api when setup so [this.alwaysRebuildAPI]', async () => {
            let app = new Nodecaf({ conf: { port: 80 }, alwaysRebuildAPI: true });
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(404);
            await app.stop();
            app._apiSpec = function({ get }){
                get('/foobar', ({ res }) => res.end());
            };
            await app.start();
            let { assert: { status } } = await base.get('foobar');
            status.is(200);
            await app.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async function(){
            let app = new Nodecaf({ conf: { port: 80 } });
            await app.start();
            await app.stop();
            this.timeout(3000);
            await assert.rejects(base.get(''));
        });

        it('Should trigger after stop event', async () => {
            let done = false;
            let app = new Nodecaf({ shutdown: () => done = true });
            await app.start();
            await app.stop();
            assert(done);
        });

        it('Should not fail when calling close sucessively', async () => {
            let app = new Nodecaf();
            await app.start();
            await app.stop();
            assert.doesNotReject( app.stop() );
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async function() {
            this.timeout(3000);
            let app = new Nodecaf({ conf: { port: 80 } });
            await app.start();
            (await base.get('')).assert.status.is(404);
            await app.restart();
            (await base.get('')).assert.status.is(404);
            await app.stop();
        });

        it('Should reload conf when new object is sent', async () => {
            let app = new Nodecaf();
            await app.start();
            await app.restart({ myKey: 3 });
            assert.strictEqual(app.conf.myKey, 3);
            await app.stop();
        });

    });

    describe('#setup', () => {

        it('Should apply settings on top of existing one', () => {
            let app = new Nodecaf({ conf: { key: 'value' } });
            app.setup({ key: 'value2', key2: 'value' });
            assert.strictEqual(app.conf.key, 'value2');
            assert.strictEqual(app.conf.key2, 'value');
        });

        it('Should load form file when path is sent', () => {
            const fs = require('fs');
            fs.writeFileSync(__dirname + '/a.toml', 'key = "value"', 'utf-8');
            let app = new Nodecaf({ conf: { key: 'valueOld' } });
            app.setup(__dirname + '/a.toml');
            assert.strictEqual(app.conf.key, 'value');
            fs.unlink(__dirname + '/a.toml', Function.prototype);
        });

    });

    describe('#trigger', () => {

        it('Should trigger route without http server', async () => {
            let app = new Nodecaf({
                conf: { port: 80 },
                api({ post }){
                    post('/foo', ({ res }) => res.status(202).end('Test'));
                    post('/nores', ({ res }) => res.status(204).end());
                }
            });
            await app.start();
            await app.trigger('post', '/nores');
            let res = await app.trigger('post', '/foo');
            assert.strictEqual(res.status, 202);
            assert.strictEqual(res.body, 'Test');
            await app.stop();
        });

        it('Should default to response status to 200', async () => {
            let app = new Nodecaf({
                conf: { port: 80 },
                api({ post }){
                    post('/foo', ({ res }) => {
                        res.setHeader('X-Test', 'Foo');
                        res.end();
                    });
                    post('/bar', ({ res }) => {
                        res.getHeader('X-Test', 'Foo');
                        res.end();
                    });
                }
            });
            await app.start();
            let r = await app.trigger('post', '/bar');
            assert.strictEqual(r.status, 200);
            let res = await app.trigger('post', '/foo', { headers: { host: 'what.com' } });
            assert.strictEqual(res.headers['X-Test'], 'Foo');
            await app.stop();
        });

        it('Should properly parse body inputs', async () => {
            let app = new Nodecaf({
                conf: { port: 80 },
                api({ post }){
                    post('/raw', ({ body, res }) => {
                        assert.strictEqual(body, 12345);
                        res.end();
                    });

                    post('/json', ({ body, res }) => {
                        assert.strictEqual(body, 12345);
                        res.end();
                    });

                    post('/text', ({ body, res }) => {
                        assert.strictEqual(body, 12345);
                        res.end();
                    });

                    post('/urlencoded', ({ body, res }) => {
                        assert.strictEqual(body, 12345);
                        res.end();
                    });
                }
            });
            await app.start();

            let r1 = await app.trigger('post', '/raw', { body: 12345 });
            assert.strictEqual(r1.status, 200);
            let r2 = await app.trigger('post', '/json', { body: 12345, headers: { 'content-type': 'application/json' } });
            assert.strictEqual(r2.status, 200);
            let r3 = await app.trigger('post', '/text', { body: 12345, headers: { 'content-type': 'text/css' } });
            assert.strictEqual(r3.status, 200);
            let r4 = await app.trigger('post', '/urlencoded', { body: 12345, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
            assert.strictEqual(r4.status, 200);

            await app.stop();
        });

    });

    describe('#pre', () => {

        it('Should run hook before any routes', async () => {
            let c = 0;
            let app = new Nodecaf({
                api({ post, pre }){
                    pre(
                        ({ next }) => { c++; next() },
                        ({ next }) => { c++; next() }
                    );
                    post('/foo', ({ res }) => res.end());
                    post('/bar', ({ res }) => res.end());
                }
            });
            await app.start();
            await app.trigger('post', '/foo');
            assert.strictEqual(c, 2);
            await app.trigger('post', '/bar');
            assert.strictEqual(c, 4);
            await app.stop();
        });

    });

    describe('#pos', () => {

        it('Should run hook before any routes', async () => {
            let c = {};
            let app = new Nodecaf({
                api({ post, pos }){
                    pos(
                        ({ next }) => { c++; next() },
                        ({ res }) => { c++; res.end() }
                    );
                    post('/foo', ({ next }) => { c = 0; next() });
                }
            });
            await app.start();
            await app.trigger('post', '/foo');
            assert.strictEqual(c, 2);
            await app.stop();
        });

    });

});

describe('Handlers', () => {

    it('Should warn about next() after stack ended', async () => {
        let app = new Nodecaf({
            api({ post }){
                post('/foobaz',
                    ({ next }) => next(),
                    ({ next, res }) => {
                        next();
                        res.end();
                    }
                );
            }
        });

        await app.start();
        let res = await app.trigger('post', '/foobaz');
        assert.strictEqual(res.status, 200);
        await app.stop();
    });

    it('Should not call next function when stack was aborted', done => {
        let app = new Nodecaf({
            api({ post }){
                post('/unknown', ({ res, next }) => {
                    res.error(500, 'test');
                    done();
                    next();
                }, () => done());
            }
        });
        (async function(){
            await app.start();
            await app.trigger('post', '/unknown');
            await app.stop();
        })();
    });

    it('Should fail when receiving invalid route handlers', () => {
        new Nodecaf({
            api({ post }){
                assert.throws(() => post('/foobar', undefined), TypeError);
                assert.throws(() => post('/foobar'), /empty/);
                post('/foobaz', Function.prototype);
                assert.throws(() => post('/foobaz', Function.prototype), /already/);
            }
        });
    });

    it('Should pass all the required args to handler', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function(obj){
                    assert(obj.res && obj.req && obj.next && !obj.body
                        && obj.params && obj.query && obj.flash
                        && obj.conf && obj.log);
                    assert(this instanceof Nodecaf);
                    obj.res.end();
                });
            }
        });
        await app.start();
        (await base.get('foo')).assert.status.is(200);
        await app.stop();
    });

    it('Should execute \'all\' handler on any path/method', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ all }){
                all(({ res, params }) => res.end(params.path));
            }
        });
        await app.start();
        assert.strictEqual((await app.trigger('post', '/foo/bar')).body, '/foo/bar');
        assert.strictEqual((await app.trigger('get', '/')).body, '/');
        await app.stop();
    });

    it('Should pass all present parameters to handler', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/fo/:o', Function.prototype);
                get('/foo/:bar', function({ params, res }){
                    res.badRequest(params.bar !== 'test');
                    res.end();
                });
            }
        });
        await app.start();
        (await base.get('foo/test')).assert.status.is(200);
        await app.stop();
    });

    it('Should parse URL query string', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ query, res, next }) => {
                    assert.strictEqual(query.foo, 'bar');
                    res.end();
                    next();
                });
            }
        });
        await app.start();
        let { status } = await base.post('foobar?foo=bar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        let app = new Nodecaf({ conf: { port: 80 } });
        await app.start();
        let { status } = await base.post('foobar');
        assert.strictEqual(status, 404);
        await app.stop();
    });

    it('Should parse object as json response [res.json()]', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.json('{"hey":"ho"}');
                });
            }
        });
        await app.start();
        (await base.get('foo')).assert.headers.match('content-type', 'application/json');
        await app.stop();
    });

    it('Should set multiple cookies properly', async function(){

        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo');
                    res.cookie('testa', 'bar');
                    res.cookie('testa', 'baz');
                    res.end();
                });
            }
        });
        await app.start();
        let { headers } = await base.get('foo');
        assert.strictEqual(headers['set-cookie'][1], 'testa=bar; Path=/');
        await app.stop();
    });

    it('Should set encrypted (signed) cookies', async function(){
        let app = new Nodecaf({
            conf: { port: 80, cookie: { secret: 'OH YEAH' } },
            api({ get }){

                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true, maxAge: 5000  });
                    res.cookie('testa', 'bar');
                    res.end();
                });

                get('/bar', function({ res, cookies, signedCookies }){
                    res.badRequest(cookies.testa !== 'bar');
                    res.badRequest(signedCookies.test !== 'foo');
                    res.end();
                });
            }
        });
        await app.start();
        let { cookies } = await base.get('foo');
        let { status } = await base.get('bar', { cookies });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should fail when tring to sign cookies without a secret', async function(){
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true });
                });
            }
        });
        await app.start();
        let { assert } = await base.get('foo');
        assert.status.is(500);
        await app.stop();
    });

    it('Should not read cookies with wrong signature', async function(){
        let app = new Nodecaf({
            conf: { port: 80, cookie: { secret: 'OH YEAH' } },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true, maxAge: 5000  });
                    res.end();
                });

                get('/bar', function({ res, signedCookies }){
                    res.badRequest(signedCookies.test !== 'foo');
                    res.end();
                });
            }
        });
        await app.start();
        let { cookies } = await base.get('foo');
        cookies['test'] = cookies['test'].substring(0, cookies['test'].length - 1) + '1';
        let { status } = await base.get('bar', { cookies });
        assert.strictEqual(status, 400);
        await app.stop();
    });

    it('Should clear cookies', async function(){
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){

                get('/foo', function({ res }){
                    res.cookie('testa', 'bar');
                    res.end();
                });

                get('/bar', function({ res }){
                    res.clearCookie('testa');
                    res.end();
                });
            }
        });
        await app.start();
        let { cookies } = await base.get('foo');
        let { headers } = await base.get('bar', { cookies });
        assert(headers['set-cookie'][0].indexOf('Expire') > -1);
        await app.stop();
    });

    it('Should run a given function as if it was regularly in the pipeline', async function(){
        function middle({ res, next }){
            res.write('K');
            next();
        }

        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', async function before({ res, fork, next }){
                    res.type('text');
                    res.write('O');
                    await fork(middle);
                    next();
                }, function after({ res }){
                    res.end('!');
                });
            }
        });
        await app.start();
        let { assert } = await base.post('foobar');
        assert.status.is(200);
        assert.body.exactly('OK!');
        await app.stop();
    });

});

describe('Body Parsing', () => {

    it('Should parse JSON request body payloads', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar', { 'Content-Type': 'application/json' }, { foo: 'bar' }
        );
        status.is(200);
        await app.stop();
    });

    it('Should send 400 when failed to parse body', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', Function.prototype);
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar', { 'Content-Type': 'application/json' }, 'foobar}'
        );
        status.is(400);
        await app.stop();
    });

    it('Should parse text request body payloads', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, '{"foo":"bar"}');
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'text/css' },
            JSON.stringify({foo: 'bar'})
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse request body without content-type', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, '{"foo":"bar"}');
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'no-auto': true, 'Content-Length': 13 },
            JSON.stringify({foo: 'bar'})
        );
        status.is(200);
        await app.stop();
    });

    it('Should not parse binary request body', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert(body instanceof Buffer);
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-type': 'application/octet-stream' },
            'fobariummuch'
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse URLEncoded request body payloads', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        status.is(200);
        await app.stop();
    });

    it('Should not parse request body when setup so', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            shouldParseBody: false,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.constructor.name, 'RequestBody');
                    res.end();
                });
            }
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        status.is(200);
        await app.stop();
    });

});

describe('Assertions', () => {

    it('Should throw when condition evaluates to true', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    assert.throws( () => res.badRequest(true, Buffer.from('abc')) );
                    assert.throws( () => res.unauthorized(true) );
                    assert.throws( () => res.forbidden(true) );
                    assert.throws( () => res.notFound(true) );
                    assert.throws( () => res.conflict(true) );
                    assert.throws( () => res.gone(true) );
                    res.end();
                });
            }
        });
        await app.start();
        await base.get('foo');
        await app.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    assert.doesNotThrow( () => res.badRequest(false) );
                    assert.doesNotThrow( () => res.unauthorized(false) );
                    assert.doesNotThrow( () => res.forbidden(false) );
                    assert.doesNotThrow( () => res.notFound(false) );
                    assert.doesNotThrow( () => res.conflict(false) );
                    assert.doesNotThrow( () => res.gone(false) );
                    res.end();
                });
            }
        });
        await app.start();
        await base.get('foo');
        await app.stop();
    });

});

describe('Error Handling', () => {
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/unknown', () => {
                    throw new Error('othererr');
                });
            }
        });
        await app.start();
        let { status: status } = await base.post('unknown');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/known', ({ res }) => {
                    throw res.error(404);
                });
                post('/unknown', ({ res }) => {
                    throw res.error(new Error('errfoobar'));
                });
                post('/serverfault', ({ res }) => {
                    throw res.error(501, { test: 'foo' });
                });
            }
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 500);
        let { status: s3 } = await base.post('serverfault');
        assert.strictEqual(s3, 501);
        await app.stop();
    });

    it('Should handle Rejection on async route', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/async', async () => {
                    await new Promise((y, n) => n());
                });
            }
        });
        await app.start();
        let { assert } = await base.post('async');
        assert.status.is(500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/known', ({ res }) => {
                    fs.readdir('.', function(){
                        res.error(404, true);
                    });
                });
                post('/unknown', async ({ res }) => {
                    await fs.readdir('.', function(){
                        res.error({ a: 'b' });
                    });
                });
                post('/unknown/object', ({ res }) => {
                    res.error(Buffer.from('abc'));
                });
            }
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 500);
        let { status: s3 } = await base.post('unknown/object');
        assert.strictEqual(s3, 500);
        await app.stop();
    });

});

describe('Logging', () => {

    it('Should not log filtered level and type', async () => {
        let app = new Nodecaf();
        app.setup({ log: { only: 'test', level: 'info' } });
        await app.start();
        assert.strictEqual(app.log.debug({ type: 'test' }), false);
        assert.strictEqual(app.log.info({ type: 'foo' }), false);
        assert(app.log.info({ type: 'test' }));
        await app.stop();
    });

    it('Should not log when disbled via conf', async () => {
        let app = new Nodecaf({ conf: { log: false } });
        await app.start();
        assert.strictEqual(app.log.debug('my entry'), false);
        assert.strictEqual(app.log.error({ type: 'foo' }), false);
        await app.stop();
    });

});

describe('Regression', () => {

    it('Should handle errors even when error event has no listeners', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/bar', () => {
                    throw new Error('errfoobar');
                });
            }
        });
        await app.start();
        let { status } = await base.post('bar');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should not fail when attempting to close during startup', async () => {
        let app = new Nodecaf();
        let p = app.start();
        await assert.doesNotReject( app.stop() );
        await p;
        await app.stop();
    });

    it('Should read correct package.json for name and version', () => {
        let app = new Nodecaf();
        assert.strictEqual(app._name, 'nodecaf');
    });

    it('Should not modify the very object used as cookie options', async () => {
        let cookieOpts = { maxAge: 68300000 };
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', cookieOpts);
                    res.cookie('testa', 'bar', cookieOpts);
                    res.json(cookieOpts);
                });
            }
        });
        await app.start();
        let { body } = await base.get('foo');
        assert.strictEqual(JSON.parse(body).maxAge, 68300000);
        await app.stop();
    });

    it('Should NOT send reponse body when assertion has no message', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.unauthorized(true);
                });
            }
        });
        await app.start();
        let { headers, body } = await base.get('foo');
        assert(!headers['content-type']);
        assert.strictEqual(body.length, 0);
        await app.stop();
    });

});

describe('Other Features', function(){

    it('Should send permissive CORS headers when setup so [cors]', async () => {
        let app = new Nodecaf({
            conf: { cors: true, port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end() );
            }
        });
        await app.start();
        const { assert } = await base.get('foobar', { 'Origin': 'http://outsider.com' });
        assert.status.is(200);
        assert.headers.match('access-control-allow-origin', '*');
        const { assert: { headers } } = await base.options('foobar', { 'Origin': 'http://outsider.com' });
        headers.match('access-control-allow-methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        await app.stop();
    });

    it('Should not send CORS headers when setup so [cors]', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end() );
            }
        });
        await app.start();
        const { assert } = await base.get('foobar', { 'Origin': 'http://outsider.com' });
        assert.status.is(200);
        assert.headers.match('access-control-allow-origin', undefined);
        await app.stop();
    });

    it('Should store data to be accessible to all handlers [app.global]', async () => {
        let app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/bar', ({ foo, res }) => {
                    res.text(foo);
                })
            }
        });
        await app.start();
        app.global.foo = 'foobar';
        let { assert: { body } } = await base.post('bar');
        body.exactly('foobar');
        await app.stop();
    });

    it('Should delay server initialization by given milliseconds [conf.delay]', async function(){
        let app = new Nodecaf({
            conf: { delay: 1500, port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end());
            }
        });
        let ps = app.start();
        await new Promise(done => setTimeout(done, 400));
        await assert.rejects(request({
            url: 'http://localhost:80/foobar',
            method: 'GET', timeout: 200
        }));
        await ps;
        let { assert: ensure } = await base.get('foobar');
        ensure.status.is(200);
        await app.stop();
    });

});
