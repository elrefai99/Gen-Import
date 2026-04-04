/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --globals
 *
 * Import once in your entry point: import './gen-import'
 * After that, all exports are available as globals — no per-file imports needed.
 */

export type { UserDto, CreateUserDto, UpdateUserDto } from './user/user.dto';

import { PORT as _PORT, NODE_ENV as _NODE_ENV, JWT_SECRET as _JWT_SECRET } from './config/env';
import { authMiddleware as _authMiddleware } from './middleware/auth.middleware';
import { UserRepository as _UserRepository } from './user/user.repository';
import { userRouter as _userRouter } from './user/user.router';
import { UserService as _UserService } from './user/user.service';

export { _PORT as PORT, _NODE_ENV as NODE_ENV, _JWT_SECRET as JWT_SECRET, _authMiddleware as authMiddleware, _UserRepository as UserRepository, _userRouter as userRouter, _UserService as UserService };

Object.assign(global as any, { PORT: _PORT, NODE_ENV: _NODE_ENV, JWT_SECRET: _JWT_SECRET, authMiddleware: _authMiddleware, UserRepository: _UserRepository, userRouter: _userRouter, UserService: _UserService });

declare global {
  var PORT: typeof _PORT
  var NODE_ENV: typeof _NODE_ENV
  var JWT_SECRET: typeof _JWT_SECRET
  var authMiddleware: typeof _authMiddleware
  var UserRepository: typeof _UserRepository
  var userRouter: typeof _userRouter
  var UserService: typeof _UserService
}
