import ListItem from './ListItem.class'
import Button from './Button.class'
import Action from '../actions/Action.class'

const ScreenTypes = Object.freeze({
    IMAGES: 'IMAGES',
    BUTTONS: 'BUTTONS'
})

class Screen extends ListItem {

    buttons: Button[] = []
    screenType = ''
    backButtonActions: Action[] = []

    /**
     * Constructor
     * @param key {string} The key/ID of this item.
     * @param screenType {string} Type of screen that this screen is.
     */
    constructor (key: string, screenType: string) {
        super(key)
        this.buttons = []
        this.screenType = screenType
        this.backButtonActions = []
    }
}

export default Screen
export {ScreenTypes}
