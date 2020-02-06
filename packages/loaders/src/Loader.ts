import { Loader as ResourceLoader, middleware, Resource } from 'resource-loader';
import { EventEmitter } from '@pixi/utils';
import { TextureLoader } from './TextureLoader';
import { ILoaderResource } from './LoaderResource';

/**
 * The new loader, extends Resource Loader by Chad Engler: https://github.com/englercj/resource-loader
 *
 * ```js
 * const loader = PIXI.Loader.shared; // PixiJS exposes a premade instance for you to use.
 * //or
 * const loader = new PIXI.Loader(); // you can also create your own if you want
 *
 * const sprites = {};
 *
 * // Chainable `add` to enqueue a resource
 * loader.add('bunny', 'data/bunny.png')
 *       .add('spaceship', 'assets/spritesheet.json');
 * loader.add('scoreFont', 'assets/score.fnt');
 *
 * // Chainable `pre` to add a middleware that runs for each resource, *before* loading that resource.
 * // This is useful to implement custom caching modules (using filesystem, indexeddb, memory, etc).
 * loader.pre(cachingMiddleware);
 *
 * // Chainable `use` to add a middleware that runs for each resource, *after* loading that resource.
 * // This is useful to implement custom parsing modules (like spritesheet parsers, spine parser, etc).
 * loader.use(parsingMiddleware);
 *
 * // The `load` method loads the queue of resources, and calls the passed in callback called once all
 * // resources have loaded.
 * loader.load((loader, resources) => {
 *     // resources is an object where the key is the name of the resource loaded and the value is the resource object.
 *     // They have a couple default properties:
 *     // - `url`: The URL that the resource was loaded from
 *     // - `error`: The error that happened when trying to load (if any)
 *     // - `data`: The raw data that was loaded
 *     // also may contain other properties based on the middleware that runs.
 *     sprites.bunny = new PIXI.TilingSprite(resources.bunny.texture);
 *     sprites.spaceship = new PIXI.TilingSprite(resources.spaceship.texture);
 *     sprites.scoreFont = new PIXI.TilingSprite(resources.scoreFont.texture);
 * });
 *
 * // throughout the process multiple signals can be dispatched.
 * loader.onProgress.add(() => {}); // called once per loaded/errored file
 * loader.onError.add(() => {}); // called once per errored file
 * loader.onLoad.add(() => {}); // called once per loaded file
 * loader.onComplete.add(() => {}); // called once when the queued resources all load.
 * ```
 *
 * @see https://github.com/englercj/resource-loader
 *
 * @class Loader
 * @memberof PIXI
 * @param {string} [baseUrl=''] - The base url for all resources loaded by this loader.
 * @param {number} [concurrency=10] - The number of resources to load concurrently.
 */
export class Loader extends ResourceLoader
{
    /**
     * Collection of all installed `use` middleware for Loader.
     *
     * @static
     * @member {Array<PIXI.ILoaderPlugin>} _plugins
     * @memberof PIXI.Loader
     * @private
     */
    private static _plugins: Array<ILoaderPlugin> = [];
    private static _shared: Loader;
    private _protected: boolean;

    constructor(baseUrl?: string, concurrency?: number)
    {
        super(baseUrl, concurrency);

        // Mix EE
        EventEmitter.call(this as any);

        for (let i = 0; i < Loader._plugins.length; ++i)
        {
            const plugin = Loader._plugins[i];
            const { pre, use } = plugin;

            if (pre)
            {
                this.pre(pre);
            }

            if (use)
            {
                this.use(use);
            }
        }

        // TODO remove when resolve mixin problems
        const ee: EventEmitter = this as any;

        // Compat layer, translate the new v2 signals into old v1 events.
        this.onStart.add((l: this) => ee.emit('start', l));
        this.onProgress.add((l: this, r: ILoaderResource) => ee.emit('progress', l, r));
        this.onError.add((l: this, r: ILoaderResource) => ee.emit('error', l, r));
        this.onLoad.add((l: this, r: ILoaderResource) => ee.emit('load', l, r));
        this.onComplete.add((l: this, r: ILoaderResource) => ee.emit('complete', l, r));

        /**
         * If this loader cannot be destroyed.
         * @member {boolean}
         * @default false
         * @private
         */
        this._protected = false;
    }

    /**
     * Destroy the loader, removes references.
     * @public
     */
    public destroy(): void
    {
        // TODO remove when resolve mixin problems
        const ee: EventEmitter = this as any;

        if (!this._protected)
        {
            ee.removeAllListeners();
            this.reset();
        }
    }

    /**
     * A premade instance of the loader that can be used to load resources.
     * @name shared
     * @type {PIXI.Loader}
     * @static
     * @memberof PIXI.Loader
     */
    public static get shared(): Loader
    {
        let shared = Loader._shared;

        if (!shared)
        {
            shared = new Loader();
            shared._protected = true;
            Loader._shared = shared;
        }

        return shared;
    }

    /**
     * Adds a Loader plugin for the global shared loader and all
     * new Loader instances created.
     *
     * @static
     * @method registerPlugin
     * @memberof PIXI.Loader
     * @param {PIXI.ILoaderPlugin} plugin - The plugin to add
     * @return {PIXI.Loader} Reference to PIXI.Loader for chaining
     */
    public static registerPlugin(plugin: ILoaderPlugin): typeof Loader
    {
        Loader._plugins.push(plugin);

        if (plugin.add)
        {
            plugin.add();
        }

        return Loader;
    }
}

// Copy EE3 prototype (mixin)
Object.assign(Loader.prototype, EventEmitter.prototype);

// parse any blob into more usable objects (e.g. Image)
Loader.registerPlugin({ use: middleware.parsing });

// parse any Image objects into textures
Loader.registerPlugin(TextureLoader);

/**
 * Plugin to be installed for handling specific Loader resources.
 *
 * @memberof PIXI
 * @typedef ILoaderPlugin
 * @property {function} [add] - Function to call immediate after registering plugin.
 * @property {PIXI.Loader.loaderMiddleware} [pre] - Middleware function to run before load, the
 *           arguments for this are `(resource, next)`
 * @property {PIXI.Loader.loaderMiddleware} [use] - Middleware function to run after load, the
 *           arguments for this are `(resource, next)`
 */
export interface ILoaderPlugin {
    add?(): void;
    pre?(resource: Resource, next?: (...args: any[]) => void): void;
    use?(resource: Resource, next?: (...args: any[]) => void): void;
}

/**
 * @memberof PIXI.Loader
 * @typedef {object} ICallbackID
 */

/**
 * @memberof PIXI.Loader
 * @typedef {function} ISignalCallback
 * @param {function} callback - Callback function
 * @param {object} [contex] - Context
 * @returns {ICallbackID} - CallbackID
 */

/**
 * @memberof PIXI.Loader
 * @typedef {function} ISignalDetach
 * @param {ICallbackID} id - CallbackID returned by `add`/`once` methods
 */

/**
 * @memberof PIXI.Loader
 * @typedef ILoaderSignal
 * @property {ISignalCallback} add - Register callback
 * @property {ISignalCallback} once - Register oneshot callback
 * @property {ISignalDetach} detach - Detach specific callback by ID
 */

/**
 * @memberof PIXI.Loader
 * @callback loaderMiddleware
 * @param {PIXI.LoaderResource} resource
 * @param {function} next
 */

/**
 * @memberof PIXI.Loader#
 * @description Dispatched when the loader begins to loading process.
 * @member {ILoaderSignal} onStart
 */

/**
 * @memberof PIXI.Loader#
 * @description Dispatched once per loaded or errored resource.
 * @member {ILoaderSignal} onProgress
 */

/**
 * @memberof PIXI.Loader#
 * @description Dispatched once per errored resource.
 * @member {ILoaderSignal} onError
 */

/**
 * @memberof PIXI.Loader#
 * @description Dispatched once per loaded resource.
 * @member {ILoaderSignal} onLoad
 */

/**
 * @memberof PIXI.Loader#
 * @description Dispatched when completely loaded all resources.
 * @member {ILoaderSignal} onComplete
 */