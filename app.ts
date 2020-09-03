import * as WebSocket from 'ws'
import {getRedis, getRedisSubscriber} from './redis'
import * as IORedis from 'ioredis'
import {
    ActionBus,
    AliasedAction,
    AlterAliasedActionAction,
    AlterButtonAction,
    AlterScreenAction,
    AlterTranslationAction,
    AuthGoogleEndHandshakeAction,
    AuthMojangEndHandshakeAction,
    AuthReestablishAuthedConnectionAction,
    Button,
    DeleteAliasedActionAction,
    DeleteButtonAction,
    DeleteScreenAction,
    DeleteTranslationAction,
    InitializeClientAction,
    MigrateKeybindsAction,
    Resolver,
    Screen
} from '@quickplaymod/quickplay-actions-js'
import StateAggregator from './StateAggregator'
import SessionContext from './SessionContext'
import MigrateKeybindsSubscriber from './subscribers/MigrateKeybindsSubscriber'
import InitializeClientSubscriber from './subscribers/InitializeClientSubscriber'
import AuthEndHandshakeSubscriber from './subscribers/AuthEndHandshakeSubscriber'
import AuthReestablishAuthedConnectionSubscriber from './subscribers/AuthReestablishAuthedConnectionSubscriber'
import AlterScreenSubscriber from './subscribers/AlterScreenSubscriber'
import DeleteScreenSubscriber from './subscribers/DeleteScreenSubscriber'
import AlterButtonSubscriber from './subscribers/AlterButtonSubscriber'
import DeleteButtonSubscriber from './subscribers/DeleteButtonSubscriber'
import DeleteAliasedActionSubscriber from './subscribers/DeleteAliasedActionSubscriber'
import AlterAliasedActionSubscriber from './subscribers/AlterAliasedActionSubscriber'
import AlterTranslationSubscriber from './subscribers/AlterTranslationSubscriber'
import DeleteTranslationSubscriber from './subscribers/DeleteTranslationSubscriber'
import SetAliasedActionAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetAliasedActionAction'
import SetButtonAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetButtonAction'
import SetScreenAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetScreenAction'
import SetTranslationAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetTranslationAction'
import RemoveAliasedActionAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/RemoveAliasedActionAction'
import RemoveButtonAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/RemoveButtonAction'
import RemoveScreenAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/RemoveScreenAction'
import RemoveTranslationAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/RemoveTranslationAction'

let redis : IORedis.Redis
let redisSub : IORedis.Redis
let actionBus : ActionBus

(async () => {
    redis = await getRedis()
    redisSub = await getRedisSubscriber()
    await begin()
})()

/**
 * Begin the websocket server.
 */
async function begin() {

    // Populate redis
    console.log('Beginning population.')
    await StateAggregator.populate()
    console.log('Population complete. Initializing on port 80.')

    // Create websocket server
    const ws = new WebSocket.Server({ port: 80 })

    // Handle changes in the aliased action/screen/button/translation lists
    redisSub.on('message', async (channel, message) => {
        if(channel != 'list-change') {
            return
        }
        const splitMsg = message.split(',')
        const id = splitMsg[0]
        const key = splitMsg[1]
        let buf

        if(id == AlterAliasedActionAction.id) {
            const aa = await AliasedAction.deserialize(await redis.hget('aliasedActions', key))
            buf = new SetAliasedActionAction(aa).build()
        } else if(id == AlterButtonAction.id) {
            const button = await Button.deserialize(await redis.hget('buttons', key))
            buf = new SetButtonAction(button).build()
        } else if(id == AlterScreenAction.id) {
            const scr = await Screen.deserialize(await redis.hget('screens', key))
            buf = new SetScreenAction(scr).build()
        } else if(id == AlterTranslationAction.id) {
            const lang = splitMsg[2]
            const val = await redis.hget('lang:' + lang, key)
            buf = new SetTranslationAction(key, lang, val).build()
        } else if(id == DeleteAliasedActionAction.id) {
            buf = new RemoveAliasedActionAction(key).build()
        } else if(id == DeleteButtonAction.id) {
            buf = new RemoveButtonAction(key).build()
        } else if(id == DeleteScreenAction.id) {
            buf = new RemoveScreenAction(key).build()
        } else if(id == DeleteTranslationAction.id) {
            const lang = splitMsg[2]
            buf = new RemoveTranslationAction(key, lang).build()
        }

        ws.clients.forEach((conn) => {
            if(conn.readyState !== WebSocket.OPEN) {
                return
            }
            conn.send(buf)
        })
    })

    // Create new action bus and add all subscriptions
    actionBus = new ActionBus()
    actionBus.subscribe(MigrateKeybindsAction, new MigrateKeybindsSubscriber())
    const endAuthSub = new AuthEndHandshakeSubscriber()
    actionBus.subscribe(AuthMojangEndHandshakeAction, endAuthSub)
    actionBus.subscribe(AuthGoogleEndHandshakeAction, endAuthSub)
    actionBus.subscribe(InitializeClientAction, new InitializeClientSubscriber())
    actionBus.subscribe(AuthReestablishAuthedConnectionAction, new AuthReestablishAuthedConnectionSubscriber())
    actionBus.subscribe(AlterScreenAction, new AlterScreenSubscriber())
    actionBus.subscribe(DeleteScreenAction, new DeleteScreenSubscriber())
    actionBus.subscribe(AlterButtonAction, new AlterButtonSubscriber())
    actionBus.subscribe(DeleteButtonAction, new DeleteButtonSubscriber())
    actionBus.subscribe(AlterAliasedActionAction, new AlterAliasedActionSubscriber())
    actionBus.subscribe(DeleteAliasedActionAction, new DeleteAliasedActionSubscriber())
    actionBus.subscribe(AlterTranslationAction, new AlterTranslationSubscriber())
    actionBus.subscribe(DeleteTranslationAction, new DeleteTranslationSubscriber())

    ws.on('connection', async function connection(conn) {

        const ctx = new SessionContext(conn)
        ctx.lastPong = new Date().getTime();

        // Adding a reference to the connection ctx is the best way to do this.
        (conn as unknown as {ctx: SessionContext}).ctx = ctx

        conn.on('pong', () => {
            ctx.lastPong = new Date().getTime()
        })

        conn.on('message', function incoming(message) {
            if(!(message instanceof Buffer)) {
                return
            }
            const action = Resolver.from(message)
            actionBus.publish(action, ctx)
        })

        conn.on('close', async () => {
            const connCount = await redis.decr('connections')
            await redis.publish('conn-notif', connCount.toString())
            if(ctx.authedResetTimeout != null) {
                clearTimeout(ctx.authedResetTimeout)
                ctx.authedResetTimeout = null
            }
        })

        conn.on('error', async function (err) {
            console.warn(err)
            conn.terminate()
        })

        const connCount = await redis.incr('connections')
        await redis.publish('conn-notif', connCount.toString())
    })

    // Ping clients every 30 seconds; Terminate clients which haven't responded in 60 seconds
    const pingInterval = 30000
    setInterval(() => {
        const now = new Date().getTime()
        ws.clients.forEach((conn) => {
            if((conn as unknown as {ctx: SessionContext}).ctx.lastPong < now - pingInterval * 2) {
                conn.terminate()
                return
            }
            conn.ping()
        })
    }, pingInterval)

    ws.on('error', async function (err) {
        console.warn(err)
    })
}
