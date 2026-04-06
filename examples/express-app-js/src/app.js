// Must be first — loads all source exports through the barrel.
import { authMiddleware, userRouter, PORT } from './gen-import.js'

import express from 'express'

const app = express()

app.use(express.json())

// Public routes
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Protected routes
app.use('/users', authMiddleware, userRouter)

// Global error handler
app.use((err, _req, res, _next) => {
    res.status(500).json({ message: err.message })
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})

export default app
