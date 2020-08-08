import SessionContext from './SessionContext'

/**
 * Actions are the core mechanism behind how Quickplay operates. Whenever the client/user
 * clicks a button, presses a keybind, receives instructions from the web server, etc.,
 * Besides some of the current commands system, the client is not able to do any I/O other than what
 * is available through Actions (eventually, ideally all the Quickplay commands would also run Actions).
 *
 * Actions are serializable in a similar format to Minecraft packets, and can be sent over the wire.
 * The structure is as follows:
 * When serialized, all Actions must contain at least 2 bytes. These are the first two bytes, which
 * are the Action's ID. All subsequent bytes are considered the payload. They can be considered arguments
 * to the Action, and are split up into partitions, each of which is one argument. An argument begins
 * with the first 4 bytes being the length x of the argument. After those bytes, the next x bytes are
 * the actual argument. This signature repeats, until there are no more bytes.
 *
 * If there are too few bytes in the Action, a RangeError will be thrown. It is possible
 * for a serialized Action to be valid, but the subsequent execution of the Action to fail if there were
 * not enough arguments provided in the payload.
 *
 * Actions can also be sent to the web server, providing context to actions/events occurring on the client,
 * such as exceptions, connection status, button presses, etc.
 */
class Action {

    id = 0
    payloadObjs:Buffer[] = []

    /**
     * This method can be called to run the implementation of whatever this Action is
     * supposed to do. Should be overridden for serverbound actions.
     * @param ctx The client connection that this action is coming from. Pass null if not relevant.
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
    run (ctx: SessionContext) : void {}

    /**
     * Build an action into a Buffer from its ID and payload list.
     * @return {Buffer} Built buffer which can be sent over the wire.
     */
    build () : Buffer {
        let body = Buffer.alloc(2)
        body.writeUInt16BE(this.id)

        for(let i = 0; i < this.payloadObjs.length; i++) {
            const payloadSize = Buffer.alloc(4)

            payloadSize.writeInt32BE(this.payloadObjs[i].byteLength)
            body = Buffer.concat([body, payloadSize, this.payloadObjs[i]])
        }

        return body
    }

    /**
     * Add an item to the payload.
     * @param obj {Buffer} Item to add.
     */
    addPayload (obj: Buffer) : void {
        this.payloadObjs.push(obj)
    }

    /**
     * Get an object from the payload at the specified index
     * @param index {number} Index of the item to get. Should be >= 0 and < payloadObjs.length
     * @return {Buffer} The payload item, or null if it does not exist.
     */
    getPayloadObject(index: number) : Buffer {
        if(this.payloadObjs.length <= index) {
            return null
        }
        return this.payloadObjs[index]
    }

    /**
     * Get an item from the Payload and convert it to a String in UTF-8.
     * @param index {number} Index of the item to get. Must be >= 0 and < payloadObjs.length
     * @return {string} Decoded String
     */
    getPayloadObjectAsString(index: number) : string {
        const obj = this.getPayloadObject(index)
        if(obj == null) {
            return null
        }
        return obj.toString()
    }

}

export default Action
