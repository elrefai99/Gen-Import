// @ts-nocheck — auto-generated barrel with lazy CJS re-exports
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 *
 * Value exports use lazy getters to prevent circular-dependency
 * errors when source files import from this barrel (CJS).
 *
 * Getters are installed on module.exports, not exports: esbuild-based
 * loaders (tsx, bun) reassign module.exports for any file containing
 * export syntax, which would strand getters bound to exports.
 */

export type { UserDto, CreateUserDto, UpdateUserDto } from './user/user.dto';

export declare const PORT: typeof import('./config/env').PORT;
export declare const NODE_ENV: typeof import('./config/env').NODE_ENV;
export declare const JWT_SECRET: typeof import('./config/env').JWT_SECRET;
export declare const authMiddleware: typeof import('./middleware/auth.middleware').authMiddleware;
export declare const UserRepository: typeof import('./user/user.repository').UserRepository;
export declare const UserService: typeof import('./user/user.service').UserService;
export declare const userRouter: typeof import('./user/user.router').userRouter;

Object.defineProperty(module.exports, 'PORT', { get() { return require('./config/env').PORT }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'NODE_ENV', { get() { return require('./config/env').NODE_ENV }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'JWT_SECRET', { get() { return require('./config/env').JWT_SECRET }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'authMiddleware', { get() { return require('./middleware/auth.middleware').authMiddleware }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'UserRepository', { get() { return require('./user/user.repository').UserRepository }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'UserService', { get() { return require('./user/user.service').UserService }, enumerable: true, configurable: true });
Object.defineProperty(module.exports, 'userRouter', { get() { return require('./user/user.router').userRouter }, enumerable: true, configurable: true });
