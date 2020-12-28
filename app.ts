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
    RemoveAliasedActionAction,
    RemoveButtonAction,
    RemoveScreenAction,
    RemoveTranslationAction,
    Resolver,
    Screen,
    ServerJoinedAction,
    ServerLeftAction,
    SetAliasedActionAction,
    SetButtonAction,
    SetClientSettingsAction,
    SetScreenAction,
    SetTranslationAction
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
import SetClientSettingsSubscriber from './subscribers/SetClientSettingsSubscriber'
import ServerJoinedSubscriber from './subscribers/ServerJoinedSubscriber'
import ServerLeftSubscriber from './subscribers/ServerLeftSubscriber'
import mysqlPool from './mysqlPool'
import {RowDataPacket} from 'mysql2'
import AddUserCountHistoryAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/AddUserCountHistoryAction'

let redis : IORedis.Redis
let redisSub : IORedis.Redis
let actionBus : ActionBus

(async () => {
    redis = await getRedis()
    redisSub = await getRedisSubscriber()
    await begin()
})()

/**
 * Delete connection count data points in the database which are older than 24 hours.
 */
async function deleteOldConnectionDatapoints(): Promise<void> {
    await mysqlPool.query('DELETE FROM connection_chart_datapoints WHERE ' +
        '`timestamp` < NOW() - INTERVAL 1 DAY')
}

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
    actionBus.subscribe(SetClientSettingsAction, new SetClientSettingsSubscriber())
    actionBus.subscribe(ServerJoinedAction, new ServerJoinedSubscriber())
    actionBus.subscribe(ServerLeftAction, new ServerLeftSubscriber())

    // Delete all data points when the server initially starts, and then every 24 hours.
    setInterval(deleteOldConnectionDatapoints, 86400000)
    await deleteOldConnectionDatapoints()

    // Once a minute, try to add the current connection count to the database if it hasn't been added
    // already within the past 5 minutes. This is the easiest solution to multiple instances of this script
    // running, however it's not the most efficient.
    setInterval(async () => {
        const sqlConn = await mysqlPool.getConnection()
        try {
            // We lock the table so another instance of this program doesn't read or alter
            // the table while we're working on it.
            await sqlConn.query('LOCK TABLE connection_chart_datapoints WRITE')
            const [resultsFromLastFive] = <RowDataPacket[]> await sqlConn.query('SELECT timestamp FROM ' +
                'connection_chart_datapoints WHERE timestamp > NOW() - INTERVAL 5 MINUTE')
            if(resultsFromLastFive.length <= 0) {
                const connections = await redis.get('connections')
                await sqlConn.query('INSERT INTO connection_chart_datapoints (connection_count) VALUES (?)', [connections])
            }

            // Send client the connection data from last hour (i.e. last two points). There can't be multiple points
            // in the graph for the same timestamp, so this is not an issue.
            const [resultsFromLastTen] = <RowDataPacket[]> await sqlConn.query('SELECT `timestamp`, connection_count FROM ' +
                'connection_chart_datapoints WHERE `timestamp` > NOW() - INTERVAL 10 MINUTE')
            for (const conn of ws.clients) {
                if(await (conn as unknown as {ctx: SessionContext}).ctx.getIsAdmin()) {
                    for(let i = 0; i < resultsFromLastTen.length; i++) {
                        (conn as unknown as {ctx: SessionContext})
                            .ctx.sendAction(new AddUserCountHistoryAction(new Date(resultsFromLastTen[i].timestamp),
                                resultsFromLastTen[i].connection_count, false))
                    }
                }
            }
        } catch(e) {
            console.error(e)
        }

        await sqlConn.query('UNLOCK TABLES')
        sqlConn.release()
    }, 60000)

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
