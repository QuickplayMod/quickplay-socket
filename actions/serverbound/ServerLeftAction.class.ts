import Action from '../Action.class'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 24
 * Received by the server when the client disconnects from the server they were previously on.
 */
class ServerLeftAction extends Action {

    /**
     * Create a new ServerLeftAction.
     */
    constructor () {
        super()
        this.id = 24
    }
}

export default ServerLeftAction
