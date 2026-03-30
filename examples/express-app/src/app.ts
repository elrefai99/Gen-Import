import express from 'express'

// All application symbols come from the barrel files — no direct source imports.
// gen-app-config re-exports everything from gen-import + gen-package in one place.
import { userRouter, authMiddleware, PORT } from './gen-app-config'

const app = express()

app.use(express.json())

// Public routes
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

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
