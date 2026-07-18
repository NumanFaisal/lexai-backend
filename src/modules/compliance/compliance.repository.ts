import { prisma } from '../../config/db';

export class ComplianceRepository {
  static async listReports(userId: string) {
    return prisma.complianceReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { 
        id: true, 
        title: true, 
        totalItems: true, 
        urgentCount: true, 
        completedCount: true, 
        createdAt: true, 
        pdfUrl: true,
        businessType: true,
        state: true,
        headcount: true,
        revenueBracket: true,
        hasUserData: true,
        isFood: true,
        isFintech: true
      }
    });
  }

  static async getReportById(reportId: string, userId: string) {
    return prisma.complianceReport.findFirst({
      where: { id: reportId, userId },
      include: { items: { orderBy: { priority: 'asc' } } }
    });
  }

  static async updateItemStatus(reportId: string, itemId: string, isCompleted: boolean, notes?: string) {
    // 1. Verify the item actually exists and belongs to this specific report
    const existingItem = await prisma.complianceItem.findFirst({
      where: { id: itemId, reportId }
    });

    if (!existingItem) {
      throw new Error('Compliance item not found in this report');
    }

    // 2. Update the specific item using ONLY its unique ID
    const updatedItem = await prisma.complianceItem.update({
      where: { id: itemId }, // <-- FIX: Only use the unique ID here
      data: { 
        isCompleted, 
        notes, 
        completedAt: isCompleted ? new Date() : null 
      }
    });

    // 3. Recalculate and update the completed count on the parent report
    const completedCount = await prisma.complianceItem.count({
      where: { reportId, isCompleted: true }
    });

    await prisma.complianceReport.update({
      where: { id: reportId },
      data: { completedCount }
    });

    return updatedItem;
  }

  static async deleteReport(reportId: string, userId: string) {
    // Verify ownership first
    const report = await prisma.complianceReport.findFirst({
      where: { id: reportId, userId }
    });
    
    if (!report) return false;

    // Cascading delete handles the associated items
    await prisma.complianceReport.delete({
      where: { id: reportId }
    });
    
    return true;
  }

}