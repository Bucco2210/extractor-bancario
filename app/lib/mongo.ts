import mongoose, { type Mongoose } from "mongoose";
import { MongoClient, type MongoClientOptions } from "mongodb";
import { getEnv } from "./env";

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

type ClientCache = {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
};

const globalForMongo = globalThis as unknown as {
  __mongooseCache?: MongooseCache;
  __mongoClientCache?: ClientCache;
};

const mongooseCache: MongooseCache =
  globalForMongo.__mongooseCache ?? { conn: null, promise: null };
const clientCache: ClientCache =
  globalForMongo.__mongoClientCache ?? { client: null, promise: null };

if (!globalForMongo.__mongooseCache) globalForMongo.__mongooseCache = mongooseCache;
if (!globalForMongo.__mongoClientCache) globalForMongo.__mongoClientCache = clientCache;

export async function conectarMongoose(): Promise<Mongoose> {
  if (mongooseCache.conn) return mongooseCache.conn;
  if (!mongooseCache.promise) {
    const env = getEnv();
    mongooseCache.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      bufferCommands: false,
      serverSelectionTimeoutMS: 5_000,
    });
  }
  mongooseCache.conn = await mongooseCache.promise;
  return mongooseCache.conn;
}

const opcionesClient: MongoClientOptions = {
  serverSelectionTimeoutMS: 5_000,
};

export async function getMongoClient(): Promise<MongoClient> {
  if (clientCache.client) return clientCache.client;
  if (!clientCache.promise) {
    const env = getEnv();
    const client = new MongoClient(env.MONGODB_URI, opcionesClient);
    clientCache.promise = client.connect();
  }
  clientCache.client = await clientCache.promise;
  return clientCache.client;
}

export const clientPromise: Promise<MongoClient> = getMongoClient();
