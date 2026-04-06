import { JWT_SECRET } from '../config/env.js'

export function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
        res.status(401).json({ message: 'Missing authorization token' })
        return
    }
    // In a real app: verify token against JWT_SECRET, attach user to req, etc.
    void JWT_SECRET
    next()
}
