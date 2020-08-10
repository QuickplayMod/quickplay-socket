import * as WebSocket from 'ws'
import Button from './gamelist/Button.class'
import AliasedAction from './gamelist/AliasedAction.class'
import Screen from './gamelist/Screen.class'
import pool from './mysqlPool'
import SessionContext from './actions/SessionContext'
import ActionResolver from './actions/ActionResolver'
import {getRedis} from './redis'
import * as IORedis from 'ioredis'

let redis : IORedis.Redis

(async () => {
    redis = await getRedis()
    await begin()
})()

// TODO this function should probably be removed or used somewhere else.
//  It does not make sense to repopulate Redis every time an instance restarts.
async function populate() {
    await redis.del('aliasedActions')
    const [actionResponse] = await pool.query('SELECT `key` FROM aliased_actions;')
    for(let i = 0; i < actionResponse.length; i++) {
        const res = await AliasedAction.pull(actionResponse[i].key)
        await redis.hset('aliasedActions', actionResponse[i].key, JSON.stringify(res))
    }

    await redis.del('buttons')
    const [buttonResponse] = await pool.query('SELECT `key` FROM buttons;')
    for(let i = 0; i < buttonResponse.length; i++) {
        const res = await Button.pull(buttonResponse[i].key)
        await redis.hset('buttons', buttonResponse[i].key, JSON.stringify(res))
    }

    await redis.del('screens')
    const [screenResponse] = await pool.query('SELECT `key` FROM screens;')
    for(let i = 0; i < screenResponse.length; i++) {
        const res = await Screen.pull(screenResponse[i].key)
        await redis.hset('screens', screenResponse[i].key, JSON.stringify(res))
    }

    // Delete all current language values
    const [languages] = await pool.query('SELECT distinct(lang) from translations')
    for(let i = 0; i < languages.length; i++) {
        await redis.del('lang:' + languages[i].lang)
    }
    // Insert all language values back into redis
    const [translationResponse] = await pool.query('SELECT * from translations;')
    for(let i = 0; i < translationResponse.length; i++) {
        await redis.hset('lang:' + translationResponse[i].lang, translationResponse[i].key, translationResponse[i].value)
    }
}

async function begin() {
    console.log('Beginning population.')
    await populate()
    console.log('Population complete. Initializing on port 80.')

    const wss = new WebSocket.Server({ port: 80 })
    wss.on('connection', async function connection(conn) {

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
            const action = ActionResolver.from(message)
            action.run(ctx)
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
        wss.clients.forEach((conn) => {
            if((conn as unknown as {ctx: SessionContext}).ctx.lastPong < now - pingInterval * 2) {
                conn.terminate()
                return
            }
            conn.ping()
        })
    }, pingInterval)

    wss.on('error', async function (err) {
        console.warn(err)
    })
}
