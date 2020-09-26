import {Action, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'

class LanguageChangedSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        const lang = action.getPayloadObjectAsString(0) || ''
        ctx.data.language = lang.toLowerCase()
        await ctx.sendGameListData()
    }
}

export default LanguageChangedSubscriber
