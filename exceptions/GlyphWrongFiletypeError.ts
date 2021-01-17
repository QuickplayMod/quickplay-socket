class GlyphWrongFiletypeError extends Error {
    constructor(...args: string[]) {
        super(...args)
        Error.captureStackTrace(this, GlyphWrongFiletypeError)
    }
}
export default GlyphWrongFiletypeError
