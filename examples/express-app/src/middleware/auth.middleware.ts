// express uses `export =` (CJS), so import types directly from 'express'.
// For packages with proper named exports (dotenv, zod, etc.), use gen-package instead.
import type { Request, Response, NextFunction } from 'express'

import { JWT_SECRET } from '../config/env'

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
        res.status(401).json({ message: 'Missing authorization token' })
        return
    }
    // In a real app: verify token against JWT_SECRET, attach user to req, etc.
    void JWT_SECRET
    next()
}
