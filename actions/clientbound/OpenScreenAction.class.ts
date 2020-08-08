import Action from '../Action.class'

/**
 * ID: 11
 * Open a screen on the client. The client should have already been sent this screen this session.
 *
 * Payload Order:
 * screen name
 */
class OpenScreenAction extends Action {

    /**
	 * Create a new OpenScreenAction.
	 * @param screenName {string} The name of the screen that the client should open.
	 */
    constructor (screenName?: string) {
        super()
        this.id = 11

        // Don't add payload if the first payload item wasn't provided
        if(screenName == undefined) {
            return
        }

        this.addPayload(Buffer.from(screenName))
    }
}

export default OpenScreenAction
