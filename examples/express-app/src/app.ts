// Must be first — registers all source exports (authMiddleware, userRouter, PORT, …) as globals.
import './gen-import'

import express from 'express'
import { authMiddleware, PORT, userRouter } from './gen-import'

const app: express.Application = express()

app.use(express.json())

// Public routes
app.get('/health', (_req: any, res: any) => res.json({ status: 'ok' }))

// Protected routes
app.use('/users', authMiddleware, userRouter)

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: err.message })
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})

export default app
