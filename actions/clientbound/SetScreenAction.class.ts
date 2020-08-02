import Action from '../Action.class'
import Screen from '../../gamelist/Screen.class'

/**
 * ID: 9
 * Set a screen in the client with the provided key and parameters.
 *
 * Payload Order:
 * key
 * screenType
 * availableOn JSON array
 * protocol
 * buttons JSON array of button keys
 * backButtonActions JSON array of aliased action keys which execute when the back button is pressed
 * translationKey
 */
class SetScreenAction extends Action {

    /**
     * Create a new SetScreenAction.
     * @param screen {Screen} Screen to be saved to the client.
     */
    constructor (screen: Screen) {
        super()
        this.id = 9
        this.addPayload(Buffer.from(screen.key))
        this.addPayload(Buffer.from(JSON.stringify(screen.availableOn)))
        this.addPayload(Buffer.from(screen.protocol))
        this.addPayload(Buffer.from(JSON.stringify(screen.buttons)))
        this.addPayload(Buffer.from(JSON.stringify(screen.backButtonActions)))
        this.addPayload(Buffer.from(screen.translationKey))
    }
}

export default SetScreenAction
