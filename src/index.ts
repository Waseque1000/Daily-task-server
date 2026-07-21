import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import taskRoutes from './routes/tasks';

dotenv.config();

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

// Routes
app.use('/api/tasks', taskRoutes);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/task-manager');
    console.log('Connected to MongoDB');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
