import Action from '../Action.class'

/**
 * ID: 6
 * Send a command to the server the client is connected to.
 *
 * Payload Order:
 * Chat command
 */
class SendChatCommandAction extends Action {

    /**
	 * Create a new SendChatCommandAction.
	 * @param cmd {string} Command to send. Beginning slash will automatically be removed if provided,
	 * and the client will add it back. To run a command that begins with two slashes (e.g. //wand, like WorldEdit), you
	 * must provide both slashes.
	 */
    constructor (cmd?: string) {
        super()
        this.id = 6

        // Don't add payload if the first payload item wasn't provided
        if(cmd == undefined) {
            return
        }

        if (cmd.startsWith('/')) { // Remove beginning slash if provided.
            cmd = cmd.slice(1)
        }
        this.addPayload(Buffer.from(cmd))
    }
}

export default SendChatCommandAction
