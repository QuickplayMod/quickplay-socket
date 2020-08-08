import Action from '../Action.class'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 19
 * Received by the server when an exception is reported by the client.
 *
 * This Action should NOT be sent if the user has not agreed to send this data.
 *
 * If you are a third party implementing Quickplay into your client, you may remove this Action from your client.
 * Any exceptions which are not sent by a user agent maintained by Quickplay developers will be disregarded. If you
 * wish for this information to be sent to you, create your own system or get in contact on the Quickplay Discord.
 *
 * If any of this information does not apply to your client, send an empty payload for that item.
 *
 * Payload Order:
 * The type of the exception
 * The message of the exception
 * The stacktrace of the exception
 * Minecraft version
 * Client version
 * Java version
 * OS name
 * Enabled state
 * Current IP
 */
class ExceptionThrownAction extends Action {

    /**
     * Create a new ExceptionThrownAction.
     * @param type {string} The type of this exception.
     * @param message {string} The message of this exception.
     * @param stacktrace {string} The stacktrace of this exception.
     * @param mcVersion Minecraft version.
     * @param clientVersion Version of the client the user is using.
     * @param javaVersion Java version.
     * @param osName Operating system name.
     * @param enabledState Whether Quickplay is enabled or not.
     * @param currentIp The Minecraft server IP the client is currently connected to.
     */
    constructor (type?: string, message?: string, stacktrace?: string, mcVersion?: string, clientVersion?: string,
        javaVersion?: string, osName?: string, enabledState?: boolean, currentIp?: string) {
        super()
        this.id = 19

        // Don't add payload if the first payload item wasn't provided
        if(type == undefined) {
            return
        }

        this.addPayload(Buffer.from(type))
        this.addPayload(Buffer.from(message))
        this.addPayload(Buffer.from(stacktrace))
        this.addPayload(Buffer.from(mcVersion))
        this.addPayload(Buffer.from(clientVersion))
        this.addPayload(Buffer.from(javaVersion))
        this.addPayload(Buffer.from(osName))

        const buf = Buffer.alloc(1)
        buf.writeUInt8(enabledState ? 1 : 0)
        this.addPayload(buf)

        this.addPayload(Buffer.from(currentIp))
    }
}

export default ExceptionThrownAction
