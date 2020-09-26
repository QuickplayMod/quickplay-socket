import {Action, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'


class GetDailyRewardSubscriber extends Subscriber {

    /*
    Official Quickplay's daily reward claiming system is proprietary. If you are creating
    your own Quickplay backend, either get in contact with the Quickplay admins or remove
    daily reward-related subscribers from your backend.
     */
    async run(action: Action, ctx: SessionContext): Promise<void> {
        // TODO
    }
}

export default GetDailyRewardSubscriber
