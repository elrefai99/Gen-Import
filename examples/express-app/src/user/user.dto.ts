// Type-only exports — gen-import emits these as `export type { ... }`
export interface UserDto {
    id: number
    email: string
    name: string
    createdAt: Date
}

export interface CreateUserDto {
    email: string
    name: string
    password: string
}

export interface UpdateUserDto {
    email?: string
    name?: string
}
