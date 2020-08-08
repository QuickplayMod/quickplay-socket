import Action from '../Action.class'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 22
 * Received by the server when the client changes languages.
 *
 * Payload Order:
 * New language ID
 */
class LanguageChangedAction extends Action {

    /**
	 * Create a new LanguageChangedAction.
	 * @param langId {string} New language ID
	 */
    constructor (langId?: string) {
        super()
        this.id = 22

        // Don't add payload if the first payload item wasn't provided
        if(langId == undefined) {
            return
        }

        this.addPayload(Buffer.from(langId))
    }
}

export default LanguageChangedAction
