import mongoose from 'mongoose';

import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}
