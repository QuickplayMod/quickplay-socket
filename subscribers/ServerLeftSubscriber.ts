import {Action, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'

class ServerLeftSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        // TODO
    }
}

export default ServerLeftSubscriber
