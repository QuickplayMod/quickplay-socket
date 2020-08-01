import ChatComponent from './ChatComponent.class'

class Message {

    message: ChatComponent
    separators: boolean
    bypassEnabledSetting: boolean

    constructor(component: ChatComponent, separators: boolean, bypassEnabledSetting: boolean) {
        if(!(component instanceof ChatComponent)) {
            throw new Error('Invalid component! Must be instance of ChatComponent')
        } else {
            this.message = component
            this.separators = separators
            this.bypassEnabledSetting = bypassEnabledSetting
        }
    }
}

export default Message
