import ChatFormatting from './ChatFormatting.enum'
import ClickEvent from './ClickEvent.class'
import HoverEvent from './HoverEvent.class'

class ChatComponent {

    text = ''
    color: string
    clickEvent: ClickEvent
    hoverEvent: HoverEvent
    italic: boolean
    obfuscated: boolean
    bold: boolean
    underline: boolean
    strikethrough: boolean
    extra: ChatComponent[]

    constructor(text: string) {
        this.setColor(ChatFormatting.white)
        this.text = text
    }

    setColor(color: string): ChatComponent {
        for(const loopColor in ChatFormatting) {
            if (ChatFormatting.hasOwnProperty(loopColor) && ChatFormatting[loopColor] === color) {
                this.color = loopColor
                return this
            }
        }

        throw new Error('Invalid color! Must be property of ChatFormatting.')
    }

    setClickEvent(clickEvent: ClickEvent): ChatComponent {
        if(clickEvent instanceof ClickEvent) {
            this.clickEvent = clickEvent
            return this
        } else {
            throw new Error('Invalid clickEvent! Must be of type ClickEvent.')
        }
    }

    setHoverEvent(hoverEvent: HoverEvent): ChatComponent {
        if(hoverEvent instanceof HoverEvent) {
            this.hoverEvent = hoverEvent
            return this
        } else {
            throw new Error('Invalid hoverEvent! Must be of type HoverEvent.')
        }
    }

    setItalic(bool: boolean): ChatComponent {
        this.italic = !!bool
        return this
    }

    setObfuscated(bool: boolean): ChatComponent {
        this.obfuscated = !!bool
        return this
    }

    setStrikethrough(bool: boolean): ChatComponent {
        this.strikethrough = !!bool
        return this
    }

    setBold(bool: boolean): ChatComponent {
        this.bold = !!bool
        return this
    }

    setUnderline(bool: boolean): ChatComponent {
        this.underline = !!bool
        return this
    }

    appendSibling(sibling: ChatComponent): ChatComponent {
        if(!Array.isArray(this.extra)) {
            this.extra = []
        }

        this.extra.push(sibling)
        return this
    }

    appendText(text: string): ChatComponent {
        this.text += text
        return this
    }
}

export default ChatComponent
