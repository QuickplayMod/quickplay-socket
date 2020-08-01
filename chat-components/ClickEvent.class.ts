
const ClickEventAction = Object.freeze({
    OPEN_URL: {
        allowedInChat: true,
        canonicalName: 'open_url'
    },
    OPEN_FILE: {
        allowedInChat: false,
        canonicalName: 'open_file'
    },
    RUN_COMMAND: {
        allowedInChat: true,
        canonicalName: 'run_command'
    },
    TWITCH_USER_INFO: {
        allowedInChat: false,
        canonicalName: 'twitch_user_info'
    },
    SUGGEST_COMMAND: {
        allowedInChat: true,
        canonicalName: 'suggest_command'
    },
    CHANGE_PAGE: {
        allowedInChat: true,
        canonicalName: 'change_page'
    }
})

interface ClickEventAction {
    allowedInChat: boolean, canonicalName: string
}

class ClickEvent {

    /**
     * Canonical name of the action
     */
    action: string
    /**
     * Value of the action
     */
    value: string

    constructor(action: ClickEventAction, value: string) {
        this.setAction(action)
        this.setValue(value)
    }

    setAction(action: ClickEventAction) : ClickEvent {

        for(const loopAction in ClickEventAction) {
            if (ClickEventAction.hasOwnProperty(loopAction) && ClickEventAction[loopAction] === action) {
                this.action = action.canonicalName
                return this
            }
        }

        throw new Error('Invalid action! Action must be property of ClickEventAction')
    }

    setValue(value: string) : void {
        this.value = String(value)
    }
}

export default ClickEvent
export {ClickEventAction}
