import { Router } from 'express';
import express from 'express';
import { handleSignup, handleSignin } from './auth.controller';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { validate } from '../../shared/middleware/validate.middleware';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { signinSchema, signupSchema } from './auth.schema';
import prisma from '../../config/db';

const router = Router();

// Inside auth.routes.ts
router.post('/signup', express.json(), validate(signupSchema), asyncHandler(handleSignup));
router.post('/signin', express.json(), validate(signinSchema), asyncHandler(handleSignin));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, persona: true }
  });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }
  res.status(200).json({ success: true, data: user });
}));

export default router;