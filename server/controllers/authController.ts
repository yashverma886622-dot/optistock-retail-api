import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.ts';
import { AuthenticatedRequest, signAuthToken } from '../middleware/auth.ts';
import { AppError } from '../middleware/errorHandler.ts';
import {
  adminCreateUserSchema,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateSettingsSchema,
  updateUserSchema,
} from '../validators/schemas.ts';

export async function register(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = registerSchema.parse(req.body);
  const existing = await User.findOne({ email: parsed.email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email already exists.', 409);
  }

  const totalUsers = await User.countDocuments();
  // First registered user becomes Admin unless explicitly seeded; subsequent public registrations default to Staff unless Admin creates them
  const assignedRole = totalUsers === 0 ? 'Admin' : parsed.role && req.user?.role === 'Admin' ? parsed.role : 'Staff';

  const passwordHash = await bcrypt.hash(parsed.password, 10);
  const user = await User.create({
    name: parsed.name,
    email: parsed.email.toLowerCase(),
    passwordHash,
    role: assignedRole,
    phone: parsed.phone,
    storeLocation: parsed.storeLocation || 'Mumbai Flagship Store',
    lastLoginAt: new Date(),
  });

  const token = signAuthToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      storeLocation: user.storeLocation,
      settings: user.settings,
    },
  });
}

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = loginSchema.parse(req.body);
  const user = await User.findOne({ email: parsed.email.toLowerCase() });
  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  if (!user.isActive) {
    throw new AppError('This user account has been deactivated.', 403);
  }

  const valid = await bcrypt.compare(parsed.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password.', 401);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAuthToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      storeLocation: user.storeLocation,
      settings: user.settings,
    },
  });
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await User.findById(req.user!.userId).select('-passwordHash');
  if (!user) {
    throw new AppError('User not found', 404);
  }
  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      storeLocation: user.storeLocation,
      settings: user.settings,
      lastLoginAt: user.lastLoginAt,
    },
  });
}

export async function updateProfileAndSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = updateSettingsSchema.parse(req.body);
  const user = await User.findById(req.user!.userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (parsed.name) user.name = parsed.name;
  if (parsed.phone !== undefined) user.phone = parsed.phone;
  if (parsed.storeLocation !== undefined) user.storeLocation = parsed.storeLocation;
  if (parsed.settings) {
    user.settings = {
      ...user.settings,
      ...parsed.settings,
    };
  }

  await user.save();
  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      storeLocation: user.storeLocation,
      settings: user.settings,
    },
  });
}

export async function listUsers(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
  res.json({ users });
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = updateUserSchema.parse(req.body);
  const user = await User.findById(id).select('-passwordHash');
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Never allow the system to be left without an active administrator
  const losingAdmin =
    user.role === 'Admin' &&
    user.isActive &&
    ((parsed.role && parsed.role !== 'Admin') || parsed.isActive === false);
  if (losingAdmin) {
    const otherAdmins = await User.countDocuments({ role: 'Admin', isActive: true, _id: { $ne: user._id } });
    if (otherAdmins === 0) {
      throw new AppError('At least one active Admin must remain. Promote another user first.', 400);
    }
  }

  if (parsed.role) user.role = parsed.role;
  if (typeof parsed.isActive === 'boolean') user.isActive = parsed.isActive;
  await user.save();
  res.json({ user });
}

export async function createUserByAdmin(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = adminCreateUserSchema.parse(req.body);
  const email = parsed.email.toLowerCase();
  if (await User.findOne({ email })) {
    throw new AppError('An account with this email already exists.', 409);
  }
  const user = await User.create({
    name: parsed.name,
    email,
    passwordHash: await bcrypt.hash(parsed.password, 10),
    role: parsed.role,
    phone: parsed.phone,
    storeLocation: parsed.storeLocation || 'Mumbai Flagship Store',
  });
  res.status(201).json({
    user: { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive },
  });
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = changePasswordSchema.parse(req.body);
  const user = await User.findById(req.user!.userId);
  if (!user) throw new AppError('User not found', 404);
  if (!(await bcrypt.compare(parsed.currentPassword, user.passwordHash))) {
    throw new AppError('Current password is incorrect.', 400);
  }
  user.passwordHash = await bcrypt.hash(parsed.newPassword, 10);
  await user.save();
  res.json({ success: true });
}
