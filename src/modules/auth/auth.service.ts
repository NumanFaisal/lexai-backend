import prisma from '../../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
// import { env } from '../../config/env'
import { AppError, UnauthorizedError } from '../../shared/errors/AppError';

// 1. Generate JWT Token Helper
const generateToken = (userId: string) => {
  // Set this to whatever you want! '7d' = 7 days, '1y' = 1 year.
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '7d', 
  });
};

// 2. Sign Up Logic
export const registerUser = async (data: any) => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) {
    // third parameter is a boolean (isOperational), not a string code
    throw new AppError('Email is already in use', 400, true);
  }

  // Hash the password (10 salt rounds is standard)
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user in DB
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.username,
      persona: data.persona,
      phone: data.phone || '',
    },
  });

  const token = generateToken(user.id);
  return { user, token };
};

// 3. Sign In Logic
export const loginUser = async (data: any) => {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Compare the plain text password with the hashed password in DB
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = generateToken(user.id);
  return { user, token };
};