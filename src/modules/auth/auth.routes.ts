// src/modules/auth/auth.routes.ts
import { Router } from 'express';
import express from 'express';
import { handleClerkWebhook, selectPersona, getMe } from './auth.controller';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { selectPersonaSchema } from './auth.schema';

const router = Router();

// Webhook Route
router.post(
  '/webhook', 
  express.raw({ type: 'application/json' }), 
  asyncHandler(handleClerkWebhook)
);

// Get User Profile Route
router.get(
  '/me',
  requireAuth,
  asyncHandler(getMe)
);

// Persona Selection Route
router.post(
  '/onboarding/persona',
  express.json(),
  requireAuth,                  // 1. Ensure logged in
  validate(selectPersonaSchema), // 2. Validate input matches Enum
  asyncHandler(selectPersona)   // 3. Process logic
);



export default router;