import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user) {
      return reply.code(401).send({ message: "Credenciais invalidas." });
    }

    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) {
      return reply.code(401).send({ message: "Credenciais invalidas." });
    }

    const token = await reply.jwtSign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: "8h" }
    );

    return reply.send({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });
}
