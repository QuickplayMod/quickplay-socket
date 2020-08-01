import * as WebSocket from 'ws'
import SystemOutAction from './actions/clientbound/SystemOutAction.class'

const wss = new WebSocket.Server({ port: 80 })

console.log('start')

wss.on('connection', function connection(conn) {
    conn.on('message', function incoming(message) {
        console.log('< ', message)
    })

    conn.send(new SystemOutAction('Hey, joe!').build())


})
