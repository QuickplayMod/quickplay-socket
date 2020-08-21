import SessionContext from '../SessionContext'
import {
    Action,
    AliasedAction,
    AuthFailedAction,
    Button,
    Screen,
    SetAliasedActionAction,
    SetButtonAction,
    SetScreenAction,
    SetTranslationAction,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import {getRedis} from '../redis'
import {IdentifierTypes} from '@quickplaymod/quickplay-actions-js/dist/actions/serverbound/InitializeClientAction'
import mysqlPool from '../mysqlPool'

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

        if(!identifier || !identifierType) {
            console.log('Auth failed: Missing identifier or identifier type.')
            ctx.sendAction(new AuthFailedAction())
            return
        }

        if(identifierType.startsWith('"')) {
            identifierType = JSON.parse(identifierType)
        }
        if(identifierType == IdentifierTypes.MOJANG && identifier.length == 36) {
            identifier = identifier.replace(/-/g, '')
        }

        let id
        if(identifierType == IdentifierTypes.GOOGLE) {
            id = await this.searchForGoogleAccount(identifier)
        } else if(identifierType == IdentifierTypes.MOJANG) {
            id = await this.findAccountFromMojangUuid(identifier)
        } else {
            console.log('Auth failed: Invalid identifier type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }
        if(id == -1) {
            // The Google ID received isn't in the database, so we can't identify them, OR
            // The Mojang ID was malformed.
            console.log('Auth failed: Google ID or Mojang UUID provided is not linked to any account.',
                'ID:', identifier, 'ID type:', identifierType)
            ctx.sendAction(new AuthFailedAction())
            return
        }
        ctx.accountId = id

        await ctx.authenticate()

        // Send screen data
        await this.sendScreenData(ctx)
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
        let [res] = await mysqlPool.query('SELECT id, mc_uuid FROM accounts WHERE mc_uuid=? LIMIT 1', [accountId])
        if(res.length <= 0) {
            await mysqlPool.query('INSERT INTO accounts (mc_uuid) VALUES (?)', [accountId])
            res = await mysqlPool.query('SELECT id, mc_uuid FROM accounts WHERE mc_uuid=? LIMIT 1', [accountId])
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
        const [res] = await mysqlPool.query('SELECT google_id, id FROM accounts WHERE google_id=? LIMIT 1', [accountId])
        if(res.length <= 0) {
            return -1
        }
        return res[0].id
    }

    /**
     * Send data about the screens, buttons, actions, and translations to the user. This is done after an
     * InitializeClientAction action because it depends on the user's language.
     * @param ctx {SessionContext} Session context
     */
    async sendScreenData(ctx: SessionContext) : Promise<void> {
        const redis = await getRedis()
        const screens = await redis.hgetall('screens')
        const buttons = await redis.hgetall('buttons')
        const aliasedActions = await redis.hgetall('aliasedActions')

        // Translations default to English. If a translation is available in the user's language, it is
        // overwritten with the translation value.
        const translations = await redis.hgetall('lang:en_us')
        if(ctx.data.language != 'en_us' && await redis.exists('lang:' + ctx.data.language)) {
            const localTranslations = await redis.hgetall('lang:' + ctx.data.language)
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
            ctx.sendAction(new SetTranslationAction(translation, ctx.data.language as string, translations[translation]))
        }
        for(const action in aliasedActions) {
            if(!aliasedActions.hasOwnProperty(action)) {
                continue
            }
            const parsedAction = await AliasedAction.deserialize(aliasedActions[action])
            ctx.sendAction(new SetAliasedActionAction(parsedAction))
        }
        for(const button in buttons) {
            if(!buttons.hasOwnProperty(button)) {
                continue
            }
            const parsedButton = await Button.deserialize(buttons[button])
            ctx.sendAction(new SetButtonAction(parsedButton))
        }
        for(const screen in screens) {
            if(!screens.hasOwnProperty(screen)) {
                continue
            }
            const parsedScreen = await Screen.deserialize(screens[screen])
            ctx.sendAction(new SetScreenAction(parsedScreen))
        }
    }
}

export default InitializeClientSubscriber
