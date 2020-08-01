/**
 * Actions are the core communication unit between the server and the client. They are essentially packets which
 * offer the ability for the web server to instruct the client on what actions to take next.
 *
 * Action byte structure:
 * ID - 2 bytes
 * Payload length - 4 bytes
 * Payload - Length of prev 4 bytes
 * Repeat prev. 2 for more payload items.
 */
class Action {

    id = 0
    payloadObjs:Buffer[] = []

    /**
     * Decode an Action from a buffer
     * @param buf {Buffer} Buffer to decode
     */
    static from (buf: Buffer) : Action {
        const action = new Action()
        action.id = buf.readInt16BE()
        let offset = 2
        // Loop until the end of the buffer is reached
        while(buf.byteLength > offset) {
            // Read length of payload slice
            const length = buf.readInt32BE(offset)
            offset += 4
            // Read payload slice
            action.addPayload(buf.slice(offset, offset + length))
            offset += length
        }
        return action
    }

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

}

export default Action
