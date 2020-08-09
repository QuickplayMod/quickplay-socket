import Action from '../Action.class'

/**
 * ID: 17
 * Set the translation value of a specified key in a specified language.
 *
 * Payload Order:
 * key
 * language
 * value
 */
class SetTranslationAction extends Action {

    /**
	 * Create a new SetTranslationAction.
     * @param key {string} The key of the translation to set.
     * @param lang {string} The language to set the key for.
     * @param val {string} The value to set the key to.
	 */
    constructor (key?: string, lang?: string, val?: string) {
        super()
        this.id = 17

        // Don't add payload if the first payload item wasn't provided
        if(key == undefined) {
            return
        }

        this.addPayload(Buffer.from(key))
        this.addPayload(Buffer.from(lang))
        this.addPayload(Buffer.from(val || ''))
    }
}

export default SetTranslationAction
