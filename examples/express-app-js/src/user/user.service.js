import { UserRepository } from './user.repository.js'

export class UserService {
    constructor(repo = new UserRepository()) {
        this.repo = repo
    }

    getAll() {
        return this.repo.findAll()
    }

    getById(id) {
        const user = this.repo.findById(id)
        if (!user) throw new Error(`User ${id} not found`)
        return user
    }

    create(dto) {
        if (this.repo.findByEmail(dto.email)) {
            throw new Error(`Email ${dto.email} already in use`)
        }
        return this.repo.create(dto)
    }

    update(id, dto) {
        const user = this.repo.update(id, dto)
        if (!user) throw new Error(`User ${id} not found`)
        return user
    }

    delete(id) {
        if (!this.repo.delete(id)) throw new Error(`User ${id} not found`)
    }
}
