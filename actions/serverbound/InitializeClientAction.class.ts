import Action from '../Action.class'
import SessionContext from '../SessionContext'

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 25
 * Received by the server when the client first initializes the socket. Intended to send client metadata.
 *
 * As an attempt to make porting Quickplay to other clients as easy as possible, only the first three payload items
 * are required. If you are a third party implementing Quickplay into your client, the other items may not be
 * relevant to your client, or your implementation or legal obligations may vary, rendering them difficult or
 * impossible to include. Additionally, they are not relevant to the Quickplay backend, but instead are used
 * to target a better user experience, debug issues, and gather user analytics.
 *
 * On the other hand, the player UUID, user agent, Quickplay version, and Minecraft language ARE required. The
 * Quickplay backend uses these items to determine what actions to send to the user, and what those actions should
 * contain in their payload. If these items are not included, the socket connection will be disconnected. If they are
 * not accurate, the user could receive actions which they should not receive, which could result in incorrect
 * buttons/translations or, at worst, client crashes.
 *
 * If a player UUID is not relevant to your client (e.g. your client only supports offline mode), submit a UUID of
 * all 0's. If you are not sure what your Quickplay user agent should be, it does not matter as long as you are
 * confident that it is unique to your client. If you are not sure what your Quickplay version should be, use the
 * version of Quickplay from which you are porting. If a Minecraft language is not relevant to your client, use
 * the default language of your client or "en_US".
 *
 * Payload Order:
 * Player UUID
 * User agent - This is the name of the client which the user is using.
 * Quickplay version
 * Minecraft language
 * Minecraft version
 * Client version - This is the version of the user agent, e.g. for Forge, it'd be the Forge version.
 */
class InitializeClientAction extends Action {

    /**
     * Create a new InitializeClientAction.
     */
    constructor (uuid?: string, userAgent?: string, qpVersion?: string, lang?: string, mcVersion?: string, clientVersion?: string) {
        super()
        this.id = 25

        // Don't add payload if the first payload item wasn't provided
        if(uuid == undefined) {
            return
        }

        this.addPayload(Buffer.from(uuid))
        this.addPayload(Buffer.from(userAgent))
        this.addPayload(Buffer.from(qpVersion))
        this.addPayload(Buffer.from(lang))

        if(mcVersion == null) {
            mcVersion = ''
        }
        if(clientVersion == null) {
            clientVersion = ''
        }

        this.addPayload(Buffer.from(mcVersion))
        this.addPayload(Buffer.from(clientVersion))
    }


    run(ctx: SessionContext): void {
        if(ctx == null) {
            return
        }
        ctx.data.uuid = this.getPayloadObjectAsString(0)
        ctx.data.userAgent = this.getPayloadObjectAsString(1)
        ctx.data.qpVersion = this.getPayloadObjectAsString(2)
        ctx.data.language = this.getPayloadObjectAsString(3)
        ctx.data.mcVersion = this.getPayloadObjectAsString(4)
        ctx.data.clientVersion = this.getPayloadObjectAsString(5)

    }
}

export default InitializeClientAction
