import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import axios from 'axios'
import * as moment from 'moment'
import * as crypto from 'crypto'
import {
    Action,
    AuthCompleteAction,
    AuthFailedAction,
    AuthMojangEndHandshakeAction,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import {OAuth2Client} from 'google-auth-library'

class AuthEndHandshakeSubscriber extends Subscriber {

    googleClientId = '582909709971-7t8enm7eoivok989ilodl49eqcc0lg31.apps.googleusercontent.com'
    googleClient = new OAuth2Client(this.googleClientId)

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(ctx.authed) {
            console.log('Auth failed: User already authed and attempting to finish auth again.')
            ctx.sendAction(new AuthFailedAction())
            throw new Error('Illegal state: User already authed and is attempting to finish authentication again.')
        }
        let valid = false
        try {
            if(action instanceof AuthMojangEndHandshakeAction) {
                valid = await this.validateWithMojangServers(action, ctx)
            } else {
                valid = await this.validateWithGoogleServers(action, ctx)
            }
        } catch(e) {
            console.error(e)
        }
        if(!valid) {
            console.log('Auth failed: Authentication with 3rd party returned false.')
            ctx.sendAction(new AuthFailedAction())
            return
        }

        try {
            return this.sendAuthCompleteAction(action, ctx)
        } catch(e) {
            console.error(e)
            ctx.sendAction(new AuthFailedAction())
        }
    }

    /**
     * Validate that the user has authenticated with the Google servers, confirming their identity.
     * @param action {Action} Action triggering this subscriber.
     * @param ctx {SessionContext} The session for the user triggering this subscriber.
     * @returns {Promise<boolean>} False if the user has not initialized their client within the last minute,
     * if they have not authenticated with Google, if the Google account ID received from Google does
     * not match the ID sent by the client in InitializeClientAction, or on error. True otherwise.
     */
    async validateWithGoogleServers(action: Action, ctx: SessionContext): Promise<boolean> {
        // Get the latest handshake request for this user's account from the last minute
        const [res] = await mysqlPool.query('SELECT * FROM sessions WHERE user=? AND token IS NULL AND handshake IS NOT NULL\
        AND created > NOW() - INTERVAL 1 MINUTE ORDER BY CREATED DESC LIMIT 1', [ctx.accountId])
        // Get user's account data
        const [accountRes] = await mysqlPool.query('SELECT * FROM accounts WHERE id=?', [ctx.accountId])

        if(res.length <= 0 || accountRes.length <= 0) {
            return false
        }

        const ticket = await this.googleClient.verifyIdToken({
            idToken: action.getPayloadObjectAsString(0),
            audience: this.googleClientId
        })
        const userId = ticket.getPayload().sub
        // Fail if for some reason the account IDs aren't matching.
        if(userId != accountRes[0].google_id as string) {
            console.error('Mismatching Google IDs:', userId, accountRes[0].google_id)
            return false
        }
        return true
    }

    /**
     * Validate that the user has logged into the Mojang servers, confirming their identity.
     * @param action {Action} Action triggering this subscriber.
     * @param ctx {SessionContext} The session for the user triggering this subscriber.
     * @returns {Promise<boolean>} False if the user has not initialized their client within the last minute,
     * if they have not logged into the Mojang servers, if the UUID received by the Mojang servers does not
     * match the UUID sent by the client in InitializeClientAction, or on error. True otherwise.
     */
    async validateWithMojangServers(action: Action, ctx: SessionContext): Promise<boolean> {
        // Get the latest handshake request for this user's account from the last minute
        const [res] = await mysqlPool.query('SELECT * FROM sessions WHERE user=? AND token IS NULL AND handshake IS NOT NULL\
        AND created > NOW() - INTERVAL 1 MINUTE ORDER BY CREATED DESC LIMIT 1', [ctx.accountId])
        // Get user's account data
        const [accountRes] = await mysqlPool.query('SELECT * FROM accounts WHERE id=?', [ctx.accountId])

        if(res.length <= 0 || accountRes.length <= 0) {
            return false
        }

        // Create a digest from the handshake and the user's UUID
        const digest = AuthEndHandshakeSubscriber.mcHexDigest(res[0].handshake + accountRes[0].mc_uuid)
        const username = action.getPayloadObjectAsString(0)
        // Request Mojang servers for if the user has "joined" the server
        const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${username}&serverId=${digest}`
        const response = await axios.get(url)

        // Response will always be 200 if the user has joined
        if(response?.status != 200) {
            return false
        }

        // Fail if for some reason the UUIDs aren't matching.
        if(response.data?.id != accountRes[0].mc_uuid as string) {
            console.error('Mismatching UUIDS:', response.data?.id, accountRes[0].mc_uuid)
            return false
        }
        return true
    }

    /**
     * Generate a session token and send it to the client, notifying them that they've been authenticated.
     * @param action {Action} The action that triggered this subscriber
     * @param ctx {SessionContext} Session context
     */
    async sendAuthCompleteAction(action: Action, ctx: SessionContext): Promise<void> {
        const [accountRes] = await mysqlPool.query('SELECT * FROM accounts WHERE id=?', [ctx.accountId])
        if(accountRes.length <= 0) {
            throw new Error('Account doesn\'t exist for the connection\'s account ID.')
        }

        // Update login timestamps
        await mysqlPool.query('UPDATE accounts SET last_login=NOW() WHERE id=?', [ctx.accountId])
        if(!accountRes[0].first_login) {
            await mysqlPool.query('UPDATE accounts set first_login=NOW() WHERE id=?', [ctx.accountId])
        }

        // Generate a new session token and add it to the database.
        // Complete auth, marking the session to expire in 3 hours.
        const token = await this.generateSessionToken(ctx)

        const [premiumRes] = await mysqlPool.query('SELECT * FROM premium_subscriptions WHERE user=? AND \
            activate_date < NOW() AND expires > NOW() LIMIT 1', [ctx.accountId])

        const premiumExpiration = premiumRes.length > 0 ? premiumRes[0].expires : null
        ctx.sendAction(new AuthCompleteAction(token, moment().add(3, 'h').toDate(),
            accountRes[0].mc_uuid, accountRes[0].discord_id || '', accountRes[0].google_id || '',
            !!accountRes[0].is_admin, (premiumRes.length > 0), premiumExpiration))
        ctx.authed = true
        ctx.authedResetTimeout = setTimeout(() => {
            ctx.authed = false
            ctx.authenticate()
        }, 3 * 60 * 60 * 1000)

        await ctx.sendEditHistory()
    }

    /**
     * Generate a session token and add it to the user's session
     * @param ctx {SessionContext} Session context
     */
    async generateSessionToken(ctx: SessionContext) : Promise<string> {
        const token = crypto.randomBytes(32).toString('hex')
        await mysqlPool.query('UPDATE sessions SET token=?, handshake=NULL WHERE user=?',
            [token, ctx.accountId])
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
        if (negative) {
            AuthEndHandshakeSubscriber.performTwosCompliment(hash)
        }
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
export default AuthEndHandshakeSubscriber
