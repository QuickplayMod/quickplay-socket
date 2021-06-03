import SessionContext from '../SessionContext'
import {Action, AuthFailedAction, Subscriber} from '@quickplaymod/quickplay-actions-js'
import {IdentifierTypes} from '@quickplaymod/quickplay-actions-js/dist/actions/serverbound/InitializeClientAction'
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

        if(!identifierType || (!identifier && identifierType != IdentifierTypes.ANONYMOUS)) {
            console.log('Auth failed: Missing identifier or identifier type.')
            ctx.sendAction(new AuthFailedAction())
            return
        }

        if(identifierType == IdentifierTypes.MOJANG && identifier.length == 36) {
            identifier = identifier.replace(/-/g, '')
        }

        let id
        if(identifierType == IdentifierTypes.GOOGLE) {
            id = await this.searchForGoogleAccount(identifier)
        } else if(identifierType == IdentifierTypes.MOJANG) {
            id = await this.findAccountFromMojangUuid(identifier)
        } else if(identifierType == IdentifierTypes.ANONYMOUS) {
            id = -1
        } else {
            console.log('Auth failed: Invalid identifier type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }
        if(id == -1 && identifierType != IdentifierTypes.ANONYMOUS) {
            // The Google ID received isn't in the database, so we can't identify them, OR
            // The Mojang ID was malformed.
            console.log('Auth failed: Google ID or Mojang UUID provided is not linked to any account.',
                'ID:', identifier, 'ID type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }
        ctx.accountId = id

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
     * Search the database for an account associated with the passed Google account ID.
     * @param accountId {string} Google account ID to search for.
     * @returns {Promise<number>} The account number, or -1 if the Google ID is not associated with any account.
     */
    async searchForGoogleAccount(accountId: string) : Promise<number> {
        if(!accountId) {
            return -1
        }
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT google_id, id FROM accounts WHERE google_id=? LIMIT 1',
            [accountId])
        if(res.length <= 0) {
            return -1
        }
        return res[0].id
    }
}

export default InitializeClientSubscriber
