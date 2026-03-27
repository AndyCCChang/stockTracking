import type { Request, Response } from 'express';
import { validateLoginInput, validateRegisterInput } from '../lib/validation.js';
import { loginUser, registerUser } from '../services/authService.js';

export async function registerController(req: Request, res: Response) {
  const input = validateRegisterInput(req.body);
  const result = await registerUser(input);
  res.status(201).json(result);
}

export async function loginController(req: Request, res: Response) {
  const input = validateLoginInput(req.body);
  const result = await loginUser(input);
  res.json(result);
}
