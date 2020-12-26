import {Action, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'

class ServerJoinedSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        const ip = action.getPayloadObjectAsString(0)
        if(ip.match(/^(?:(?:(?:.*\.)?hypixel\.net)|(?:209\.222\.115\.\d{1,3}))(?::\d{1,5})?$/gi)) {
            if(ip.toLowerCase() == 'alpha.hypixel.net') {
                await ctx.setCurrentServer('Hypixel Alpha Network')
            } else {
                await ctx.setCurrentServer('Hypixel Network')
            }
        } else {
            await ctx.setCurrentServer('Unrecognized Server')
        }
    }
}

export default ServerJoinedSubscriber
