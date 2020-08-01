import ListItem from './ListItem.class'
import Action from '../actions/Action.class'


class Button extends ListItem {

    actions: Action[] = []
    imageURL = ''
    translation = ''

    /**
     * Constructor
     * @param key {string} The key/ID of this item.
     */
    constructor (key: string) {
        super(key)
    }
}

export default Button
