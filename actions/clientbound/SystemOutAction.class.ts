import Action from '../Action.class'

/**
 * ID: 4
 * Send a message to the client's system.out. Mainly used for debugging.
 */
class SystemOutAction extends Action {

    /**
	 * Create a new SystemOutAction.
	 * @param message {string} the message to send to the client's logs
	 */
    constructor (message: string) {
        super()
        this.id = 4
        this.addPayload(Buffer.from(message))
    }
}

export default SystemOutAction
