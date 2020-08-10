import Action from '../Action.class'

/**
 * ID: 26
 * Begin authentication with the backend by sending a handshake token to the client.
 *
 * Payload Order:
 * Handshake token
 */
class AuthBeginHandshakeAction extends Action {

    /**
	 * Create a new AuthBeginHandshakeAction.
	 * @param handshakeToken {string} Handshake token to send
	 */
    constructor (handshakeToken?: string) {
        super()
        this.id = 26
        if(handshakeToken == undefined) {
            return
        }

        this.addPayload(Buffer.from(handshakeToken))
    }
}

export default AuthBeginHandshakeAction
