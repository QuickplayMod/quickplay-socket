import Action from '../Action.class'

/**
 * ID: 28
 * Finalize authentication by sending the client a session token and when this session expires
 *
 * Payload Order:
 * Session token
 * Expiration timestamp
 */
class AuthCompleteAction extends Action {

    /**
     * Create a new AuthCompleteAction.
     * @param sessionToken {string} Session token to send
     * @param expiration {Date} Timestamp at which this session expires
     */
    constructor (sessionToken?: string, expiration?: Date) {
        super()
        this.id = 28
        if(sessionToken == undefined || expiration == undefined) {
            return
        }

        this.addPayload(Buffer.from(sessionToken))
        const buf = Buffer.alloc(8)
        buf.writeBigInt64BE(BigInt(expiration.getTime()))
        this.addPayload(buf)
    }
}

export default AuthCompleteAction
