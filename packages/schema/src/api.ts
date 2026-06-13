import { z } from "zod";

export const RegisterRequest = z.object({
  profile: z.unknown().optional(),
});

export const RegisterResponse = z.object({
  deviceId: z.string(),
  deviceSecret: z.string(),
  claimCode: z.string(),
});

export const ClaimRequest = z.object({
  code: z.string().min(4),
  name: z.string().min(1).max(60).optional(),
});

export const UserRegisterRequest = z.object({
  name: z.string().min(1).max(60),
  email: z.email().max(120),
  password: z.string().min(8).max(200),
});

export const UserLoginRequest = z.object({
  email: z.email().max(120),
  password: z.string().min(1).max(200),
});

export type UserRegisterRequestT = z.infer<typeof UserRegisterRequest>;
export type UserLoginRequestT = z.infer<typeof UserLoginRequest>;

export type RegisterResponseT = z.infer<typeof RegisterResponse>;
export type ClaimRequestT = z.infer<typeof ClaimRequest>;
