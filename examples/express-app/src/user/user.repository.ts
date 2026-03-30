import { UserDto, CreateUserDto, UpdateUserDto } from '../user/user.dto'

// Simulates a DB layer — no framework deps, no barrel imports needed here.
const store = new Map<number, UserDto>()
let nextId = 1

export class UserRepository {
    findAll(): UserDto[] {
        return Array.from(store.values())
    }

    findById(id: number): UserDto | undefined {
        return store.get(id)
    }

    findByEmail(email: string): UserDto | undefined {
        return Array.from(store.values()).find((u) => u.email === email)
    }

    create(dto: CreateUserDto): UserDto {
        const user: UserDto = { id: nextId++, ...dto, createdAt: new Date() }
        store.set(user.id, user)
        return user
    }

    update(id: number, dto: UpdateUserDto): UserDto | undefined {
        const user = store.get(id)
        if (!user) return undefined
        const updated = { ...user, ...dto }
        store.set(id, updated)
        return updated
    }

    delete(id: number): boolean {
        return store.delete(id)
    }
}
