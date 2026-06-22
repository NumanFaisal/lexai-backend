// src/modules/whatsapp/whatsapp.service.ts
import { Twilio } from 'twilio';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { WhatsappRepository } from './whatsapp.repository';
import { researchAgent } from '../../ai/agents/research/research.agent';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { WhatsAppFormatter } from '../../shared/utils/whatsapp.format'

// Initialize Twilio Client
const twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export class WhatsappService {
  /**
   * Processes incoming Twilio Webhook payload.
   */
  static async processIncomingMessage(payload: any) {
    const fromPhone = payload.From.replace('whatsapp:', ''); // Extract actual phone number
    const toPhone = payload.To;
    const incomingText = payload.Body.trim();

    logger.info({ msg: '[WhatsApp] Incoming message', from: fromPhone });

    // 1. Fetch or create session
    const session = await WhatsappRepository.getOrCreateSession(fromPhone);

    if (session.isBlocked) {
      return; // Ignore messages from blocked numbers
    }

    // 2. Hydrate conversation history for LangChain
    const rawContext = typeof session.contextMessages === 'string' 
      ? JSON.parse(session.contextMessages) 
      : session.contextMessages || [];
    
    const conversationHistory: BaseMessage[] = rawContext.map((msg: any) => 
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    // 3. Process Query via Research Agent
    // Fallback to a generic ID if the WhatsApp user hasn't linked their web account
    const activeUserId = session.userId || `wa_unregistered_${fromPhone}`;

    try {
      // Set state to PROCESSING
      await WhatsappRepository.setSessionState(fromPhone, 'PROCESSING');

      const result = await researchAgent.run({
        query: incomingText,
        userId: activeUserId,
        model: 'gpt-4o', // Fast and cheap for WhatsApp interactions
        conversationHistory,
      });

      // 4. Send the response back via Twilio
      const formattedResponse = WhatsAppFormatter.formatForWhatsApp(result.response);
      await this.sendWhatsAppMessage(toPhone, payload.From, formattedResponse);

      // 5. Update Context (Keep last 6 messages)
      rawContext.push({ role: 'user', content: incomingText });
      rawContext.push({ role: 'ai', content: result.response });
      
      const updatedContext = rawContext.slice(-6); // Retain window size

      // 6. Save State and Usage
      await WhatsappRepository.updateSessionContext(fromPhone, updatedContext, true);
      await WhatsappRepository.setSessionState(fromPhone, 'IDLE');

    } catch (error) {
      logger.error({ msg: '[WhatsApp] Processing error', error: (error as Error).message });
      await this.sendWhatsAppMessage(
        toPhone, 
        payload.From, 
        "⚠️ I am currently experiencing technical difficulties. Please try again in a few minutes."
      );
      await WhatsappRepository.setSessionState(fromPhone, 'IDLE');
    }
  }

  /**
   * Sends a message using the Twilio API
   */
  static async sendWhatsAppMessage(from: string, to: string, body: string) {
    try {
      // Twilio has a 1600 char limit. Chunking by 1500 chars to be safe.
      const CHUNK_SIZE = 1500;
      for (let i = 0; i < body.length; i += CHUNK_SIZE) {
        const chunk = body.substring(i, i + CHUNK_SIZE);
        await twilioClient.messages.create({
          body: chunk,
          from,
          to,
        });
      }
      logger.info({ msg: '[WhatsApp] Message sent successfully', to });
    } catch (error) {
      logger.error({ msg: '[WhatsApp] Failed to send message', error: (error as Error).message });
    }
  }
}