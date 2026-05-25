import { Router } from 'express';
import express from 'express';
import { handleSignup, handleSignin } from './auth.controller';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { validate } from '@/shared/middleware/validate.middleware';
import { signinSchema, signupSchema } from './auth.schema';

const router = Router();

// Inside auth.routes.ts
router.post('/signup', express.json(), validate(signupSchema), asyncHandler(handleSignup));
router.post('/signin', express.json(), validate(signinSchema), asyncHandler(handleSignin));

export default router;