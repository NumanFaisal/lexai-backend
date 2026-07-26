import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../shared/errors/AppError';

const prisma = new PrismaClient();

export const listTemplates = async (req: Request, res: Response) => {
  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  res.status(200).json({
    status: 'success',
    data: { templates },
  });
};

export const getTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;

  const template = await prisma.template.findUnique({
    where: { id },
  });

  if (!template) {
    throw new NotFoundError('Template not found');
  }

  res.status(200).json({
    status: 'success',
    data: { template },
  });
};
