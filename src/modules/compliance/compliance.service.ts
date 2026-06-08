import { complianceAgent } from '../../ai/agents/compliance/compliance.agent';
import { getStateSpecificRules } from '../../shared/helpers/state-rules.helper';
import { GenerateComplianceInput } from './compliance.schema';
import { Queue } from 'bullmq';
import { redisClient } from '../../config/redis';


// Initialize BullMQ Queue for PDF export
const compliancePdfQueue = new Queue('compliance-pdf-queue', { connection: redisClient });

export class ComplianceService {
  static async generateComplianceReport(userId: string, businessProfile: GenerateComplianceInput) {
    // 1. Run the AI Pipeline
    const agentOutput = await complianceAgent.run({
      businessProfile,
      userId,
      model: 'gpt-4o'
    });

    // 2. Append Hardcoded state Rules
    const stateRules = getStateSpecificRules(businessProfile.state);
    if (stateRules.length > 0) {
      agentOutput.items = [...agentOutput.items, ...stateRules];
      agentOutput.totalItems = agentOutput.items.length;
      agentOutput.urgentCount = agentOutput.items.filter(i => i.priority === 'URGENT').length;
    }

    return agentOutput;
  }

  static async exportToPdf(reportId: string, userId: string) {
    await compliancePdfQueue.add('generate-pdf', { reportId, userId });
  }
}