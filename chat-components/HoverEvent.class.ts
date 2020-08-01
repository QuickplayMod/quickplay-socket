import ChatComponent from './ChatComponent.class'

const HoverEventAction = Object.freeze({
    SHOW_TEXT: {
        allowedInChat: true,
        canonicalName: 'show_text'
    },
    SHOW_ACHIEVEMENT: {
        allowedInChat: true,
        canonicalName: 'show_achievement'
    },
    SHOW_ITEM: {
        allowedInChat: true,
        canonicalName: 'show_item'
    },
    SHOW_ENTITY: {
        allowedInChat: true,
        canonicalName: 'show_entity'
    }
})

interface HoverEventAction {
    allowedInChat: boolean, canonicalName: string
}

class HoverEvent {

    /**
     * Canonical name of the action
     */
    action: string
    /**
     * Value of the action
     */
    value: ChatComponent

    constructor(action: HoverEventAction, value: ChatComponent) {
        this.setAction(action)
        this.setValue(value)
    }

    setAction(action: HoverEventAction): HoverEvent {

        for(const loopAction in HoverEventAction) {
            if (HoverEventAction.hasOwnProperty(loopAction) && HoverEventAction[loopAction] === action) {
                this.action = action.canonicalName
                return this
            }
        }

        throw new Error('Invalid action! Action must be property of HoverEventAction')
    }

    setValue(value: ChatComponent): void {
        if(value instanceof ChatComponent) {
            this.value = value
        } else {
            throw new Error('Invalid value! Value must be instance of ChatComponent.')
        }
    }
}

export default HoverEvent
export {HoverEventAction}
