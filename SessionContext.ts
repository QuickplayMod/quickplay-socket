import * as crypto from 'crypto'
import {
    Action,
    AliasedAction,
    AuthBeginHandshakeAction,
    Button,
    ChatComponent,
    ChatFormatting,
    Message,
    Screen,
    SendChatCommandAction,
    SendChatComponentAction,
    SetAliasedActionAction,
    SetButtonAction,
    SetScreenAction,
    SetTranslationAction
} from '@quickplaymod/quickplay-actions-js'
import mysqlPool from './mysqlPool'
import PushEditHistoryEventAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/PushEditHistoryEventAction'
import {getRedis} from './redis'
import {sprintf} from 'sprintf-js'
import {RowDataPacket} from 'mysql2'
import SetCurrentServerAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetCurrentServerAction'
import AddUserCountHistoryAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/AddUserCountHistoryAction'
import WebSocket = require('ws');
import Timer = NodeJS.Timer;

/**
 * Generate a handshake token and add it to the database for a specific session context.
 * Returns null if the user has initiated authentication within the past 5 seconds.
 * @param ctx {SessionContext} Session context to generate the token for.
 */
async function generateHandshakeToken(ctx: SessionContext) : Promise<string> {
    // Handshakes can only be generated every 5 seconds per user
    let res
    try {
        [res] = await mysqlPool.query('SELECT COUNT(id) FROM sessions WHERE user=? AND created > NOW() - INTERVAL 5 SECOND',
            [ctx.accountId])
    } catch(e) {
        console.error(e)
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }
    if(res[0]['COUNT(id)'] > 0) {
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: You\'re doing that too fast! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }

    const bytes = crypto.randomBytes(32)
    const token = bytes.toString('hex')

    try {
        await mysqlPool.query('INSERT INTO sessions (handshake, user) VALUES (?,?)', [token, ctx.accountId])
    } catch(e) {
        console.error(e)
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }

    return token
}

export default class SessionContext {

    constructor(conn: WebSocket) {
        this.conn = conn
    }

    conn: WebSocket
    data: Record<string, unknown> = {}
    lastPong: number
    authed = false
    accountId = -1
    authedResetTimeout: Timer = null

    async getIsAdmin() : Promise<boolean> {
        const [res] = <RowDataPacket[]> await mysqlPool.query(
            'SELECT is_admin FROM accounts WHERE id=?', [this.accountId])
        if(res.length <= 0) {
            this.authed = false
        }
        return !!res[0].is_admin
    }

    /**
     * Initiate authentication with the client. This function generates a handshake token for the user and
     * sends a new AuthBeginHandshakeAction. Authentication is periodically redone, specifically once every 3 hours.
     */
    async authenticate() : Promise<void> {
        this.authed = false
        if(this.authedResetTimeout != null) {
            clearTimeout(this.authedResetTimeout)
            this.authedResetTimeout = null
        }
        try {
            const token = await generateHandshakeToken(this)
            if(token == null) {
                return
            }
            this.sendAction(new AuthBeginHandshakeAction(token))
        } catch(e) {
            console.error(e)
            this.sendChatComponentMessage(new Message(
                new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                    .setColor(ChatFormatting.red)
            ))
        }
    }

    /**
     * Send a chat component to the user's chat via a {@link SendChatComponentAction}
     * @param component {ChatComponent} The component to send. Should not be null.
     */
    sendChatComponentMessage(component: Message) : void {
        if(component == null) {
            return
        }
        const action = new SendChatComponentAction(component)
        this.conn.send(action.build())
    }

    /**
     * Send a chat command on behalf of the user via a {@link SendChatCommandAction}.
     * @param command {string} The command to send. Beginning slash will automatically be removed if provided,
     * and the client will add it back. To run a command that begins with two slashes (e.g. //wand, like WorldEdit), you
     * must provide both slashes.
     */
    sendChatCommand(command: string) : void {
        if(command == null || command.length < 0) {
            return
        }
        const action = new SendChatCommandAction(command)
        this.sendAction(action)
    }

    /**
     * Send an Action to the client.
     * @param action {Action} Action to send. If null, nothing is sent.
     */
    sendAction(action: Action) : void {
        if(action == null) {
            return
        }
        this.conn.send(action.build())
    }

    /**
     * Send the (recent) edit history to the user. If this user is not an admin, nothing is sent.
     */
    async sendEditHistory(): Promise<void> {
        if(!this.authed || ! await this.getIsAdmin()) {
            return
        }
        const [editHistory] = <RowDataPacket[]> await mysqlPool.query(
            'SELECT * from edit_log ORDER BY timestamp DESC LIMIT 1000')

        for(let i = 0; i < editHistory.length; i++) {
            const e = editHistory[i]
            if(!e) {
                continue
            }
            const editAction = new PushEditHistoryEventAction(new Date(e.timestamp), e.edited_by, e.item_type,
                e.item_key, !!e.deleted, e.prev_version)
            this.sendAction(editAction)
        }
    }

    /**
     * Send the connection history from the last 7 days to the client if they're an admin
     */
    async sendConnectionHistory(): Promise<void> {
        if(await this.getIsAdmin()) {
            try {
                const [resultsFromLastTen] = <RowDataPacket[]> await mysqlPool.query('SELECT `timestamp`, connection_count FROM ' +
                    'connection_chart_datapoints WHERE `timestamp` > NOW() - INTERVAL 24 HOUR')
                for(let i = 0; i < resultsFromLastTen.length; i++) {

                    this.sendAction(new AddUserCountHistoryAction(new Date(resultsFromLastTen[i].timestamp),
                        resultsFromLastTen[i].connection_count, i == 0))
                }
            } catch(e) {
                console.error(e)
            }

        }
    }

    /**
     * Send data about the screens, buttons, actions, and translations to the user. This should be done after an
     * InitializeClientAction action because it depends on the user's language. If no language is present,
     * English is used.
     */
    async sendGameListData() : Promise<void> {
        const redis = await getRedis()
        const screens = await redis.hgetall('screens')
        const buttons = await redis.hgetall('buttons')
        const aliasedActions = await redis.hgetall('aliasedActions')

        // Translations default to English. If a translation is available in the user's language, it is
        // overwritten with the translation value.
        const translations = await redis.hgetall('lang:en_us')
        if(this.data.language != 'en_us' && await redis.exists('lang:' + this.data.language)) {
            const localTranslations = await redis.hgetall('lang:' + this.data.language)
            for(const item in localTranslations) {
                if(!localTranslations.hasOwnProperty(item)) {
                    continue
                }
                translations[item] = localTranslations[item]
            }
        }

        for(const translation in translations) {
            if(!translations.hasOwnProperty(translation)) {
                continue
            }
            this.sendAction(new SetTranslationAction(translation, this.data.language as string, translations[translation]))
        }
        for(const action in aliasedActions) {
            if(!aliasedActions.hasOwnProperty(action)) {
                continue
            }
            const parsedAction = await AliasedAction.deserialize(aliasedActions[action])
            this.sendAction(new SetAliasedActionAction(parsedAction))
        }
        for(const button in buttons) {
            if(!buttons.hasOwnProperty(button)) {
                continue
            }
            const parsedButton = await Button.deserialize(buttons[button])
            this.sendAction(new SetButtonAction(parsedButton))
        }
        for(const screen in screens) {
            if(!screens.hasOwnProperty(screen) || !screens[screen]) {
                continue
            }
            const parsedScreen = await Screen.deserialize(screens[screen])
            this.sendAction(new SetScreenAction(parsedScreen))
        }
    }

    async disable(reason: string): Promise<void> {
        // TODO
    }

    /**
     * Notify the client of the recognized server that they have connected to.
     * @param serverName Name/ID of the server they've connected to.
     */
    async setCurrentServer(serverName: string): Promise<void> {
        this.data.currentServer = serverName
        this.sendAction(new SetCurrentServerAction(serverName))
    }

    /**
     * Translate a given key into the preferred language of this session.
     * @param key {string} Translation key to translate
     * @param args {string[]} Arguments to be used to replace variables in the translation, if necessary.
     * @return {Promise<string>} The translated string, or the original key if no translation was found
     */
    async translate(key: string, ...args: string[]): Promise<string> {
        const redis = await getRedis()
        const result = await redis.hget('lang:' + this.data.language, key)
        if(result != null) {
            return sprintf(result, ...args)
        }
        const englishResult = await redis.hget('lang:en_us', key)
        if(englishResult != null) {
            return sprintf(englishResult, ...args)
        }
        return key
    }
}
