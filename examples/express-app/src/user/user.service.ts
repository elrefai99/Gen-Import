import { UserRepository } from './user.repository'
import { UserDto, CreateUserDto, UpdateUserDto } from './user.dto'

export class UserService {
    constructor(private readonly repo: UserRepository = new UserRepository()) {}

    getAll(): UserDto[] {
        return this.repo.findAll()
    }

    getById(id: number): UserDto {
        const user = this.repo.findById(id)
        if (!user) throw new Error(`User ${id} not found`)
        return user
    }

    create(dto: CreateUserDto): UserDto {
        if (this.repo.findByEmail(dto.email)) {
            throw new Error(`Email ${dto.email} already in use`)
        }
        return this.repo.create(dto)
    }

    update(id: number, dto: UpdateUserDto): UserDto {
        const user = this.repo.update(id, dto)
        if (!user) throw new Error(`User ${id} not found`)
        return user
    }

    delete(id: number): void {
        if (!this.repo.delete(id)) throw new Error(`User ${id} not found`)
    }
}
