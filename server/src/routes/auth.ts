import { Router } from 'express';
import { loginController, registerController } from '../controllers/authController.js';

const router = Router();

router.post('/auth/register', async (req, res, next) => {
  try {
    await registerController(req, res);
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    await loginController(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
