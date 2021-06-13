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
import DisableModAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/DisableModAction'
import {RowDataPacket} from 'mysql2'

class AuthEndHandshakeSubscriber extends Subscriber {

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
                valid = await this.validateWithDiscordServers(action, ctx)
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
     * Validate that the user has authenticated with the Discord servers, confirming their identity.
     * @param action {Action} Action triggering this subscriber.
     * @param ctx {SessionContext} The session for the user triggering this subscriber.
     * @returns {Promise<boolean>} False if the user has not authenticated with Discord, or on error. True otherwise.
     */
    async validateWithDiscordServers(action: Action, ctx: SessionContext): Promise<boolean> {
        // Safety check against CSRF. Client should have already checked this, but this is an extra check.
        if(action.getPayloadObjectAsString(1) != ctx.data.discordState) {
            return false
        }
        const discAuthResponse = await axios.post('https://discordapp.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: action.getPayloadObjectAsString(0),
            redirect_uri: process.env.DISCORD_OAUTH_REDIRECT_URI

        }))
        const discordAccessToken = discAuthResponse?.data?.access_token

        const discMeResponse = await axios.get('https://discord.com/api/v9/users/@me', {
            headers: {
                authorization: 'Bearer ' + discordAccessToken
            }
        })

        if(!discMeResponse?.data?.id) {
            console.log('No Discord user ID received from Discord API!')
            return false
        }

        const id = discMeResponse.data.id

        const [sqlAccountRes] = (<RowDataPacket[]> await mysqlPool.query('SELECT id FROM accounts WHERE discord_id=?', id))
        if(sqlAccountRes.length == 0) {
            return false // No account exists w/ this Discord account
            // TODO linking system. Something like "Please run command /qp linkdiscord <special code>" in MC
        }
        ctx.accountId = sqlAccountRes[0].id
        // Create the session for this user, since it wasn't created before authentication like MC.
        await mysqlPool.query('INSERT INTO sessions (user, handshake) VALUES (?,?)', [ctx.accountId, ctx.data.discordState])

        await ctx.sendGameListData() // Resend games list now that we know the user's identity.
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
        if(ctx.accountId == -1) {
            return false
        }
        // Get the latest handshake request for this user's account from the last minute
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM sessions WHERE user=? AND \
        token IS NULL AND handshake IS NOT NULL AND created > NOW() - INTERVAL 1 MINUTE ORDER BY CREATED DESC LIMIT 1',
        [ctx.accountId])
        // Get user's account data
        const [accountRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM accounts WHERE id=?',
            [ctx.accountId])

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
        const [accountRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM accounts WHERE id=?',
            [ctx.accountId])
        if(accountRes.length <= 0) {
            throw new Error('Account doesn\'t exist for the connection\'s account ID.')
        }

        if(accountRes[0].banned) {
            ctx.sendAction(new DisableModAction(await ctx.translate('quickplay.bannedFromOfficialApi')))
            return
        }

        // Update login timestamps
        await mysqlPool.query('UPDATE accounts SET last_login=NOW() WHERE id=?', [ctx.accountId])
        if(!accountRes[0].first_login) {
            await mysqlPool.query('UPDATE accounts set first_login=NOW() WHERE id=?', [ctx.accountId])
        }

        // Generate a new session token and add it to the database.
        // Complete auth, marking the session to expire in 3 hours.
        const token = await this.generateSessionToken(ctx)

        const [premiumRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM premium_subscriptions WHERE \
            user=? AND activate_date < NOW() AND expires > NOW() LIMIT 1', [ctx.accountId])

        const premiumExpiration = premiumRes.length > 0 ? premiumRes[0].expires : null
        ctx.authed = true
        ctx.authedResetTimeout = setTimeout(() => {
            ctx.authed = false
            ctx.authenticate()
        }, 3 * 60 * 60 * 1000)

        const userRankData = await ctx.getHypixelRankData()
        ctx.sendAction(new AuthCompleteAction(token, moment().add(3, 'h').toDate(),
            accountRes[0].mc_uuid, accountRes[0].discord_id || '',
            !!accountRes[0].is_admin, (premiumRes.length > 0), premiumExpiration,
            userRankData.rank, userRankData.packageRank, userRankData.isBuildTeam, userRankData.isBuildTeamAdmin))

        await ctx.beginSendingCurrentUserCount()
        await ctx.sendConnectionHistory()
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
