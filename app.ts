import * as WebSocket from 'ws'
import Button from './gamelist/Button.class'
import AliasedAction from './gamelist/AliasedAction.class'
import Screen from './gamelist/Screen.class'
import pool from './mysqlPool'
import SessionContext from './actions/SessionContext'
import ActionResolver from './actions/ActionResolver'
import * as Redis from 'ioredis'

const redis = new Redis(6379, 'redis')
const redisSubscriber = redis.duplicate()

let redisConnected = false
let redisPubSubConnected = false

redisSubscriber.on('connect', async () => {
    console.log('Redis sub connected')
    await redisSubscriber.subscribe('conn-notif')

    redisSubscriber.on('message', (channel, msg) => {
        console.log(channel, ':', msg)
    })

    // Do not begin program until both redis are connected
    redisPubSubConnected = true
    if(redisConnected) {
        await begin()
    }
})
redis.on('connect', async () => {
    console.log('Redis connected')
    await redis.set('connections', 0)

    // Do not begin program until both redis are connected
    redisConnected = true
    if(redisPubSubConnected) {
        await begin()
    }
})

async function populate() {
    await redis.del('aliasedActions')
    const actionResponse = await pool.query('SELECT `key` FROM aliased_actions;')
    for(let i = 0; i < actionResponse.length; i++) {
        const res = await AliasedAction.pull(actionResponse[i].key)
        await redis.hset('aliasedActions', actionResponse[i].key, JSON.stringify(res))
    }

    await redis.del('buttons')
    const buttonResponse = await pool.query('SELECT `key` FROM buttons;')
    for(let i = 0; i < buttonResponse.length; i++) {
        const res = await Button.pull(buttonResponse[i].key)
        await redis.hset('buttons', buttonResponse[i].key, JSON.stringify(res))
    }

    await redis.del('screens')
    const screenResponse = await pool.query('SELECT `key` FROM screens;')
    for(let i = 0; i < screenResponse.length; i++) {
        const res = await Screen.pull(screenResponse[i].key)
        await redis.hset('screens', screenResponse[i].key, JSON.stringify(res))
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
            console.log('pong')
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
        })

        const connCount = await redis.incr('connections')
        await redis.publish('conn-notif', connCount.toString())
    })

    const pingInterval = 30000
    setInterval(() => {
        const now = new Date().getTime()
        wss.clients.forEach((conn) => {
            if((conn as unknown as {ctx: SessionContext}).ctx.lastPong < now - pingInterval * 2) {
                console.log('Connection lost')
                conn.terminate()
                return
            }
            conn.ping()
            console.log('ping')
        })
    }, pingInterval)

    wss.on('error', async function (err) {
        console.log('Error', err)
    })
}
