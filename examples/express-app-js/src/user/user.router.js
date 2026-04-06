import express from 'express'
import { UserService } from './user.service.js'

const service = new UserService()

export const userRouter = express.Router()

userRouter.get('/', (_req, res) => {
    res.json(service.getAll())
})

userRouter.get('/:id', (req, res, next) => {
    try {
        res.json(service.getById(Number(req.params.id)))
    } catch (err) {
        next(err)
    }
})

userRouter.post('/', (req, res, next) => {
    try {
        const user = service.create(req.body)
        res.status(201).json(user)
    } catch (err) {
        next(err)
    }
})

userRouter.patch('/:id', (req, res, next) => {
    try {
        res.json(service.update(Number(req.params.id), req.body))
    } catch (err) {
        next(err)
    }
})

userRouter.delete('/:id', (req, res, next) => {
    try {
        service.delete(Number(req.params.id))
        res.status(204).send()
    } catch (err) {
        next(err)
    }
})
