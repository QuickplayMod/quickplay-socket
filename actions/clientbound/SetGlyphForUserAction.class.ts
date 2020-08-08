import Action from '../Action.class'

/**
 * ID: 14
 * Set the URL for a user's Glyph. The client will download this image if it is necessary.
 *
 * Payload Order:
 * user UUID
 * glyph URL
 * glyph height (32intBE)
 * glyph offset (floatBE)
 * glyph in-game visibility (1byte, 1 or 0 for boolean)
 */
class SetGlyphForUserAction extends Action {

    /**
     * Create a new SetGlyphForUserAction.
     * @param uuid {string} The UUID of the user for which this Glyph belongs.
     * @param url {string} The URL of the Glyph.
     * @param height {number} The height of this glyph
     * @param yOffset {number} The offset from the top of the player of this glyph
     * @param displayInGames {boolean} Whether this glyph should be displayed in games or not.
     */
    constructor (uuid?: string, url?: string, height?: number, yOffset?: number, displayInGames?: boolean) {
        super()
        this.id = 14

        // Don't add payload if the first payload item wasn't provided
        if(uuid == undefined) {
            return
        }

        this.addPayload(Buffer.from(uuid))
        this.addPayload(Buffer.from(url))
        const heightBuf = Buffer.alloc(4)
        heightBuf.writeInt32BE(height)
        this.addPayload(heightBuf)
        const offsetBuf = Buffer.alloc(8)
        offsetBuf.writeFloatBE(height)
        this.addPayload(offsetBuf)
        const displayInGamesBuf = Buffer.alloc(1)
        displayInGamesBuf.writeUInt8(displayInGames ? 1 : 0)
    }
}

export default SetGlyphForUserAction
