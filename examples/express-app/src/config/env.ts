// dotenv has proper named exports — import config through gen-package barrel.
import { config } from '../gen-package'

config()  // load .env into process.env

export const PORT = process.env.PORT ?? '3000'
export const NODE_ENV = process.env.NODE_ENV ?? 'development'
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret'
