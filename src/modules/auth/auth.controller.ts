import { Request, Response } from 'express';
import { registerUser, loginUser } from './auth.service';

export const handleSignup = async (req: Request, res: Response) => {
  const { user, token } = await registerUser(req.body);

  res.status(201).json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, name: user.name, persona: user.persona },
      token // Send the token to the frontend!
    }
  });
};

export const handleSignin = async (req: Request, res: Response) => {
  const { user, token } = await loginUser(req.body);

  res.status(200).json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, name: user.name, persona: user.persona },
      token
    }
  });
};