import Action from '../Action.class'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 23
 * Received by the server when the client connects to a new Minecraft server.
 * Could be singleplayer, in which case the IP is "singleplayer".
 *
 * Payload Order:
 * The IP of the server joined
 * Metadata JSON about the server
 */
class ServerJoinedAction extends Action {

    /**
     * Create a new ServerJoinedAction.
     * @param ip {string} The IP of the server the client joined.
     * @param metadata {string} JSON data about the server the client joined, e.g. logo.
     */
    constructor (ip?: string, metadata?: string) {
        super()
        this.id = 23

        // Don't add payload if the first payload item wasn't provided
        if(ip == undefined) {
            return
        }

        this.addPayload(Buffer.from(ip))
        this.addPayload(Buffer.from(JSON.stringify(metadata)))
    }
}

export default ServerJoinedAction
