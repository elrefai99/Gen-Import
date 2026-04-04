// express uses `export =` (CJS), so import Router and types directly from 'express'.
import express from 'express'
import type { Request, Response, NextFunction } from 'express'

import { UserService } from './user.service'

const service = new UserService()

export const userRouter: express.Router = express.Router()

userRouter.get('/', (_req: Request, res: Response) => {
    res.json(service.getAll())
})

userRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
        res.json(service.getById(Number(req.params.id)))
    } catch (err) {
        next(err)
    }
})

userRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = service.create(req.body)
        res.status(201).json(user)
    } catch (err) {
        next(err)
    }
})

userRouter.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
        res.json(service.update(Number(req.params.id), req.body))
    } catch (err) {
        next(err)
    }
})

userRouter.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
        service.delete(Number(req.params.id))
        res.status(204).send()
    } catch (err) {
        next(err)
    }
})
