// src/modules/whatsapp/whatsapp.routes.ts
import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { 
  handleTwilioWebhook, 
  getWhatsAppStatus, 
  linkWhatsApp, 
  unlinkWhatsApp 
} from './whatsapp.controller';

const router = Router();

// EXTERNAL WEBHOOK (No JWT auth, relies on Twilio validation)

router.post(
  '/webhook', 
  express.urlencoded({ extended: true }), 
  asyncHandler(handleTwilioWebhook)
);

// PROTECTED FRONTEND APIs (Requires JWT auth)

router.use('/frontend', requireAuth);

router.get('/frontend/status', asyncHandler(getWhatsAppStatus));
router.post('/frontend/link', express.json(), asyncHandler(linkWhatsApp));
router.post('/frontend/unlink', asyncHandler(unlinkWhatsApp));

export default router;