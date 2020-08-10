import Action from '../Action.class'
import SessionContext from '../SessionContext'
import * as crypto from 'crypto'
import axios from 'axios'
import mysqlPool from '../../mysqlPool'
import ChatComponent from '../../chat-components/ChatComponent.class'
import Message from '../../chat-components/Message.class'
import ChatFormattingEnum from '../../chat-components/ChatFormatting.enum'
import DisableModAction from '../clientbound/DisableModAction.class'
import AuthCompleteAction from '../clientbound/AuthCompleteAction.class'
import * as moment from 'moment'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 27
 * Received by the server when the client is done authenticating with
 * Mojang's servers, and Quickplay's backend should check for authenticity.
 *
 * Payload Order:
 * Minecraft username
 */
class AuthEndHandshakeAction extends Action {

    /**
	 * Create a new AuthEndHandshakeAction.
     * @param username {string} The current client's username
	 */
    constructor (username?: string) {
        super()
        this.id = 27

        if(username == undefined) {
            return
        }

        this.addPayload(Buffer.from(username || ''))
    }

    run(ctx: SessionContext) : void {
        super.run(ctx)
        this.sendAuthCompleteAction(ctx)
    }

    /**
     * Check for session server request sent, and if everything checks out, generate and send the user a session token.
     * @param ctx {SessionContext} Session context
     */
    async sendAuthCompleteAction(ctx: SessionContext) : Promise<void> {
        // Handshake should take no more than 1 minute. Select all sessions which have a handshake and no token, and
        // which were created within the last 1 minute.
        let res
        try {
            /* Multiple clients attempting to connect at the same time from the same UUID will result
            in the first client failing. This is not a concern, really, as it'd only be an issue
            if the authentication takes longer than 5 seconds anyway (client cannot connect more than once per 5s) */
            [res] = await mysqlPool.query('SELECT * FROM sessions WHERE uuid=? AND token IS NULL AND handshake IS NOT NULL\
            AND created > NOW() - INTERVAL 1 MINUTE ORDER BY created DESC LIMIT 1', [ctx.data.uuid])
            // Fail if there is no existing handshake from past 2 minutes
            if(res.length <= 0) {
                ctx.authed = false
                ctx.sendChatComponentMessage(new Message(
                    (await ChatComponent.translate(ctx.data.language as string, 'quickplay.failedToAuth'))
                        .setColor(ChatFormattingEnum.red)
                ))
                return
            }
            // Create a digest from the handshake and the user's UUID
            const digest = AuthEndHandshakeAction.mcHexDigest(res[0].handshake + ctx.data.uuid)
            const username = this.getPayloadObjectAsString(0)
            // Request Mojang servers for if the user has "joined" the server
            const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${username}&serverId=${digest}`
            const response = await axios.get(url)
            // Response will always be 200 if the user has joined
            if(response?.status != 200) {
                ctx.authed = false
                ctx.sendChatComponentMessage(new Message(
                    (await ChatComponent.translate(ctx.data.language as string, 'quickplay.failedToAuth'))
                        .setColor(ChatFormattingEnum.red)
                ))
                return
            }
            // Fail if for some reason the UUIDs aren't matching. Removes all the user's sessions as well.
            if(response.data?.id != ctx.data.uuid as string) {
                console.error('Mismatching UUIDS:', response.data?.id, ctx.data.uuid)
                ctx.sendAction(new DisableModAction('Mismatching UUIDs'))
                await mysqlPool.query('DELETE FROM sessions WHERE uuid=?', [ctx.data.uuid])
                ctx.authed = false
                ctx.conn.close()
                return
            }

            try {
                // Generate a new session token and add it to the database.
                // Complete auth, marking the session to expire in 3 hours.
                const token = await this.generateSessionToken(ctx, res[0].handshake)
                ctx.sendAction(new AuthCompleteAction(token, moment().add(3, 'h').toDate()))
                ctx.authed = true
                ctx.authedResetTimeout = setTimeout(() => {
                    ctx.authed = false
                    ctx.authenticate()
                }, 3 * 60 * 60 * 1000)
            } catch(e) {
                console.error(e)
                ctx.authed = false
                ctx.sendChatComponentMessage(new Message(
                    (await ChatComponent.translate(ctx.data.language as string, 'quickplay.failedToAuth'))
                        .setColor(ChatFormattingEnum.red)
                ))
            }

        } catch(e) {
            console.error(e)
            ctx.authed = false
            ctx.sendChatComponentMessage(new Message(
                (await ChatComponent.translate(ctx.data.language as string, 'quickplay.failedToAuth'))
                    .setColor(ChatFormattingEnum.red)
            ))
        }
    }

    /**
     * Generate a session token and add it to the user's session
     * @param ctx {SessionContext} Session context
     * @param handshake {string} The handshake token
     */
    async generateSessionToken(ctx: SessionContext, handshake: string) : Promise<string> {
        const token = crypto.randomBytes(32).toString('hex')
        await mysqlPool.query('UPDATE sessions SET token=?, handshake=NULL WHERE uuid=? AND handshake=?',
            [token, ctx.data.uuid, handshake])
        return token
    }

    /**
     * Create a hex digest with Minecraft's hash algorithm
     * @see "https://gist.github.com/unascribed/70e830d471d6a3272e3f"
     * @param str {string} String to hash
     * @return Resulting hash
     */
    static mcHexDigest(str: string) : string {
        const hash = Buffer.from(crypto.createHash('sha1').update(str).digest())
        // check for negative hashes
        const negative = hash.readInt8(0) < 0
        if (negative) AuthEndHandshakeAction.performTwosCompliment(hash)
        let digest = hash.toString('hex')
        // trim leading zeroes
        digest = digest.replace(/^0+/g, '')
        if (negative) digest = '-' + digest
        return digest

    }

    /**
     * Perform twos complement on the buffer
     * @param buffer {Buffer} Buffer to perform twos complement on.
     */
    static performTwosCompliment(buffer: Buffer) : void {
        let carry = true
        let i, newByte, value
        for (i = buffer.length - 1; i >= 0; --i) {
            value = buffer.readUInt8(i)
            newByte = ~value & 0xff
            if (carry) {
                carry = newByte === 0xff
                buffer.writeUInt8(newByte + 1, i)
            } else {
                buffer.writeUInt8(newByte, i)
            }
        }
    }
}

export default AuthEndHandshakeAction
