import * as crypto from 'crypto'
import {
    Action,
    AuthBeginHandshakeAction,
    ChatComponent,
    ChatFormatting,
    Message,
    SendChatCommandAction,
    SendChatComponentAction
} from '@quickplaymod/quickplay-actions-js'
import mysqlPool from './mysqlPool'
import PushEditHistoryEventAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/PushEditHistoryEventAction'
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
        const [res] = await mysqlPool.query('SELECT is_admin FROM accounts WHERE id=?', [this.accountId])
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
     * Send the (recent) edit history to the user. The user should only receive edit history if they are an admin.
     */
    async sendEditHistory(): Promise<void> {
        if(!this.authed || ! await this.getIsAdmin()) {
            return
        }
        const [editHistory] = await mysqlPool.query('SELECT * from edit_log ORDER BY timestamp DESC LIMIT 1000')

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
}
