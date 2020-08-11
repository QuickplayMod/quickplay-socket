import SessionContext from '../SessionContext'
import {
    Action,
    AliasedAction,
    Button,
    Screen,
    SetAliasedActionAction,
    SetButtonAction,
    SetScreenAction,
    SetTranslationAction,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import {getRedis} from '../redis'

class InitializeClientSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(ctx == null) {
            return
        }
        ctx.data.uuid = action.getPayloadObjectAsString(0)?.replace(/-/g, '')
        ctx.data.userAgent = action.getPayloadObjectAsString(1)?.toLowerCase()
        ctx.data.qpVersion = action.getPayloadObjectAsString(2)
        ctx.data.language = action.getPayloadObjectAsString(3)?.toLowerCase()
        ctx.data.mcVersion = action.getPayloadObjectAsString(4)
        ctx.data.clientVersion = action.getPayloadObjectAsString(5)
        await ctx.authenticate()
        // Send screen data
        await this.sendScreenData(ctx)
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
