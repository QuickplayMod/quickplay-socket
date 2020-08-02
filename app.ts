import * as WebSocket from 'ws'
import SystemOutAction from './actions/clientbound/SystemOutAction.class'
import Button from './gamelist/Button.class'
import AliasedAction from './gamelist/AliasedAction.class'
import Screen from './gamelist/Screen.class'
import pool from './mysqlPool'
import SetAliasedActionAction from './actions/clientbound/SetAliasedActionAction.class'

let aliasedActionMap = {}
let buttonMap = {}
let screenMap = {}

async function populate() {
    aliasedActionMap = {}
    const actionResponse = await pool.query('SELECT `key` FROM aliased_actions;')
    for(let i = 0; i < actionResponse.length; i++) {
        aliasedActionMap[actionResponse[i].key] = await AliasedAction.pull(actionResponse[i].key)
    }

    buttonMap = {}
    const buttonResponse = await pool.query('SELECT `key` FROM buttons;')
    for(let i = 0; i < buttonResponse.length; i++) {
        buttonMap[buttonResponse[i].key] = await Button.pull(buttonResponse[i].key)
    }

    screenMap = {}
    const screenResponse = await pool.query('SELECT `key` FROM screens;')
    for(let i = 0; i < screenResponse.length; i++) {
        screenMap[screenResponse[i].key] = await Screen.pull(screenResponse[i].key)
    }
}

console.log('Beginning population.')
populate().then(() => {
    console.log('Population complete. Initializing on port 80.')

    const wss = new WebSocket.Server({ port: 80 })
    wss.on('connection', function connection(conn) {
        conn.on('message', function incoming(message) {
            console.log('< ', message)
        })

        const aa = new AliasedAction('steve')
        aa.availableOn = ['Hypixel Network', 'Hypixel Alpha Network']
        aa.protocol = '2,'
        aa.action = new SystemOutAction('Hello, world!!')

        const action = new SetAliasedActionAction(aa)
        conn.send(action.build())


    })
})
