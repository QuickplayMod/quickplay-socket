import pool from '../mysqlPool'

const ScreenTypes = Object.freeze({
    IMAGES: 'IMAGES',
    BUTTONS: 'BUTTONS'
})

class Screen {

    key: string
    availableOn: string[] = []
    protocol = ''
    buttons: string[] = [] // Keys of Buttons
    screenType = ''
    translationKey = ''
    backButtonActions: number[] = [] // IDs of AliasedActions
    imageURL = ''

    /**
     * Constructor
     * @param key {string} The key/ID of this item.
     * @param screenType {string} Type of screen that this screen is.
     */
    constructor (key: string, screenType: string) {
        this.key = key
        this.buttons = []
        this.screenType = screenType
        if(!ScreenTypes[this.screenType]) {
            throw new Error('Invalid screen type: Screen type must be IMAGES or BUTTONS.')
        }
        this.backButtonActions = []
    }


    /**
     * Pull a screen from the database and fill in it's serialized fields.
     * @param key {string} The key of the screen to pull.
     */
    static async pull(key: string): Promise<Screen> {
        const res = await pool.query('SELECT * FROM screens WHERE `key`=?', [key])

        if (res.length <= 0) {
            return null
        }
        const s = new Screen(res[0].key, res[0].screenType)
        s.availableOn = JSON.parse(res[0].availableOn)
        s.protocol = res[0].protocol
        s.translationKey = res[0].translationKey
        s.imageURL = res[0].imageURL

        const actions = JSON.parse(res[0].backButtonActions)
        for(let i = 0; i < actions.length; i++) {
            s.backButtonActions.push(actions[i])
        }
        const buttons = JSON.parse(res[0].buttons)
        for(let i = 0; i < buttons.length; i++) {
            s.buttons.push(buttons[i])
        }
        return s
    }
}

export default Screen
export {ScreenTypes}
