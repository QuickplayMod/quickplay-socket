import {Action, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'

class ButtonPressedSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        /*
        This is currently unused, but may be useful for custom
        system implementations without requiring a client-side update.
         */
    }
}

export default ButtonPressedSubscriber
