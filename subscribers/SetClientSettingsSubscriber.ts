import {Action, Subscriber, SystemOutAction} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'

class SetClientSettingsSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        const json = action.getPayloadObjectAsString(0)
        try {
            ctx.data.settings = JSON.parse(json)
        } catch(e) {
            ctx.sendAction(new SystemOutAction('WARNING: Quickplay settings sent by this client contain invalid JSON.'))
        }
    }
}

export default SetClientSettingsSubscriber
