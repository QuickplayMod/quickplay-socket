import Action from '../Action.class'

/**
 * ID: 15
 * Set the list keybinds to a new JSON object for this user.
 * This is currently only used to migrate keybinds from pre-2.1.0 to post-2.1.0.
 * @see MigrateKeybindsAction
 *
 * Payload Order:
 * valid JSON that goes into keybinds.json
 */
class SetKeybindsAction extends Action {

    /**
	 * Create a new SetKeybindsAction.
	 * @param keybinds {Record<string, ?>[]} New keybinds to serialize and send to the client.
	 */
    constructor (keybinds?: Record<string, unknown>[]) {
        super()
        this.id = 15

        // Don't add payload if the first payload item wasn't provided
        if(keybinds == undefined) {
            return
        }

        this.addPayload(Buffer.from(JSON.stringify(keybinds)))
    }
}

export default SetKeybindsAction
