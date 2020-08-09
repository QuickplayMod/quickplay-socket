import Action from '../Action.class'
import Button from '../../gamelist/Button.class'

/**
 * ID: 8
 * Set a button in the client with the provided key and parameters.
 *
 * Payload Order:
 * key
 * availableOn JSON array
 * protocol
 * actions JSON array of aliased action keys
 * imageURL
 * translationKey
 */
class SetButtonAction extends Action {

    /**
     * Create a new SetButtonAction.
     * @param button {Button} Button to be saved to the client.
     */
    constructor (button?: Button) {
        super()
        this.id = 8

        // Don't add payload if the first payload item wasn't provided
        if(button == undefined) {
            return
        }

        this.addPayload(Buffer.from(button.key))
        this.addPayload(Buffer.from(JSON.stringify(button.availableOn || [])))
        this.addPayload(Buffer.from(button.protocol || ''))
        this.addPayload(Buffer.from(JSON.stringify(button.actions || [])))
        this.addPayload(Buffer.from(button.imageURL || ''))
        this.addPayload(Buffer.from(button.translationKey || ''))
    }
}

export default SetButtonAction
