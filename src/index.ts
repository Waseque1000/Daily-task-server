import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import taskRoutes from './routes/tasks';

dotenv.config();

let cachedDb: typeof mongoose | null = null;

async function connectDB() {
  if (cachedDb) return cachedDb;
  const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/task-manager');
  cachedDb = conn;
  return conn;
}

// Initialize Firebase Admin (if credentials are provided)
const hasFirebaseCredentials =
  process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL;

if (hasFirebaseCredentials) {
  const firebaseConfig = {
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  };
  admin.initializeApp(firebaseConfig);
  console.log('Firebase Admin initialized');
} else {
  console.warn('Firebase Admin not initialized - missing credentials. Auth will be disabled.');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB on every request (cached connection reused)
app.use(async (_, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Routes
app.use('/api/tasks', taskRoutes);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server only when NOT in Vercel serverless environment
if (!process.env.VERCEL) {
  const start = async () => {
    try {
      await connectDB();
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };
  start();
}

export default app;
