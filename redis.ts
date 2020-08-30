import * as Redis from 'ioredis'
import IORedis = require('ioredis');

const redis = new Redis(6379, process.env.REDIS_HOST)
const redisSubscriber = redis.duplicate()

let redisConnected = false
let redisSubConnected = false

redisSubscriber.on('connect', async () => {
    console.log('Redis sub connected')
    await redisSubscriber.subscribe('conn-notif')
    await redisSubscriber.subscribe('list-change')
    redisSubConnected = true
})
redis.on('connect', async () => {
    console.log('Redis connected')
    await redis.set('connections', 0)
    redisConnected = true
})

function getRedis () : Promise<IORedis.Redis> {
    return new Promise((resolve) => {
        let resolved = false
        redis.on('connect', () => {
            resolve(redis)
            redisConnected = true
            resolved = true
        })
        // Push code to the bottom of the event loop
        setTimeout(() => {
            if(redisConnected && !resolved) {
                resolve(redis)
            }
        }, 0)
    })
}

function getRedisSubscriber() : Promise<IORedis.Redis> {
    return new Promise((resolve) => {
        let resolved = false
        redisSubscriber.on('connect', () => {
            resolve(redisSubscriber)
            resolved = true
        })
        if(redisSubConnected && !resolved) {
            resolve(redisSubscriber)
        }
    })
}

export { getRedis, getRedisSubscriber }
