import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { z } from "zod";
import { clientPromise, conectarMongoose } from "./mongo";
import { Usuario, type RolUsuario } from "@/models/Usuario";
import { verificarPassword } from "./password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      rol: RolUsuario;
    } & DefaultSession["user"];
  }
  interface User {
    rol?: RolUsuario;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    rol?: RolUsuario;
  }
}

const credencialesSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw) {
        const parsed = credencialesSchema.safeParse(raw);
        if (!parsed.success) return null;
        await conectarMongoose();
        const usuario = await Usuario.findOne({
          email: parsed.data.email,
          activo: true,
        }).lean();
        if (!usuario) return null;
        const ok = await verificarPassword(parsed.data.password, usuario.passwordHash);
        if (!ok) return null;
        return {
          id: String(usuario._id),
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.rol = (user as { rol?: RolUsuario }).rol ?? "operador";
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      if (token.rol === "admin" || token.rol === "operador") {
        session.user.rol = token.rol;
      }
      return session;
    },
  },
});
