// Simulates a DB layer — no framework deps, no barrel imports needed here.
const store = new Map()
let nextId = 1

export class UserRepository {
    findAll() {
        return Array.from(store.values())
    }

    findById(id) {
        return store.get(id)
    }

    findByEmail(email) {
        return Array.from(store.values()).find((u) => u.email === email)
    }

    create(dto) {
        const user = { id: nextId++, ...dto, createdAt: new Date() }
        store.set(user.id, user)
        return user
    }

    update(id, dto) {
        const user = store.get(id)
        if (!user) return undefined
        const updated = { ...user, ...dto }
        store.set(id, updated)
        return updated
    }

    delete(id) {
        return store.delete(id)
    }
}
