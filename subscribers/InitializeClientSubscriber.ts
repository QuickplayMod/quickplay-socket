import SessionContext from '../SessionContext'
import {Action, AuthFailedAction, IdentifierTypes, Subscriber} from '@quickplaymod/quickplay-actions-js'
import mysqlPool from '../mysqlPool'
import {RowDataPacket} from 'mysql2'

class InitializeClientSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(ctx == null) {
            return
        }

        ctx.data.userAgent = action.getPayloadObjectAsString(2)?.toLowerCase()
        ctx.data.qpVersion = action.getPayloadObjectAsString(3)
        ctx.data.language = action.getPayloadObjectAsString(4)?.toLowerCase()
        ctx.data.mcVersion = action.getPayloadObjectAsString(5)
        ctx.data.clientVersion = action.getPayloadObjectAsString(6)

        // Try to identify the user. If identification fails, we provide the user with all the defaults.
        // Note this isn't authentication (we can't trust this user is who they say they are), so secret info should
        // not be based on this. For that, see the authed property on SessionContext.
        let identifier = action.getPayloadObjectAsString(0)
        let identifierType = action.getPayloadObjectAsString(1)

        if(identifierType.startsWith('"')) {
            identifierType = JSON.parse(identifierType)
        }

        if(!identifierType ||
            (!identifier && identifierType != IdentifierTypes.ANONYMOUS && identifierType != IdentifierTypes.DISCORD)) {
            console.log('Auth failed: Missing identifier or identifier type.')
            ctx.sendAction(new AuthFailedAction())
            return
        }

        if(identifierType == IdentifierTypes.MOJANG && identifier.length == 36) {
            identifier = identifier.replace(/-/g, '')
        }

        let id
        if(identifierType == IdentifierTypes.MOJANG) {
            id = await this.findAccountFromMojangUuid(identifier)
        } else if (identifierType == IdentifierTypes.DISCORD && identifier) {
            id = await this.findAccountFromDiscordId(identifier)
        // Identifier is not required with discord identifier type. It is only necessary if the client wants to
        // re-establish a previously-established connection.
        } else if(identifierType == IdentifierTypes.ANONYMOUS || identifierType == IdentifierTypes.DISCORD) {
            id = -1
        } else {
            console.log('Auth failed: Invalid identifier type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }

        // If the user provided an ID and they aren't using anonymous mode, then give an error
        if(id == -1 && identifierType != IdentifierTypes.ANONYMOUS && identifier) {
            console.log('Auth failed: Malformed Mojang UUID or invalid Discord ID',
                'ID:', identifier, 'ID type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }
        ctx.accountId = id
        ctx.authMode = identifierType

        await ctx.authenticate()
        await ctx.sendGameListData()
        await ctx.sendGlyphs()
    }

    /**
     * Find the account ID from the provided Mojang UUID. If it does not exist, then create one, assuming the UUID is valid.
     * @param accountId {string} Mojang UUID
     * @returns {Promise<number>} The account number, or -1 if the account ID passed is malformed.
     */
    async findAccountFromMojangUuid(accountId: string): Promise<number> {
        if(!accountId || accountId.length != 32 || accountId == '00000000000000000000000000000000') {
            return -1
        }
        let [res] = <RowDataPacket[]> await mysqlPool.query('SELECT id, mc_uuid FROM accounts WHERE mc_uuid=? LIMIT 1',
            [accountId])
        if(res.length <= 0) {
            await mysqlPool.query('INSERT INTO accounts (mc_uuid) VALUES (?)', [accountId])
            res = (<RowDataPacket[]> await mysqlPool.query('SELECT id, mc_uuid FROM accounts WHERE mc_uuid=? LIMIT 1',
                [accountId]))[0]
            // Should never happen...
            if(res.length <= 0) {
                throw new Error('User could not be found in database despite just being defined!')
            }
        }
        return res[0].id
    }

    /**
     * Find the account ID from the provided Discord ID.
     * @param accountId {string} Discord ID
     * @returns {Promise<number>} The account number, or -1 if the account ID passed is malformed or not found.
     */
    async findAccountFromDiscordId(accountId: string): Promise<number> {
        if(!accountId) {
            return -1
        }
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT id FROM accounts WHERE discord_id=? LIMIT 1',
            [accountId])

        if(res.length <= 0) {
            return -1
        }
        return res[0].id
    }
}

export default InitializeClientSubscriber
