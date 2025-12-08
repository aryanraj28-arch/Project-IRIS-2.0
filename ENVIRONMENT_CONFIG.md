# Environment Configuration Guide

This guide explains how to configure environment variables for both frontend and backend.

## 📁 Directory Structure

```
proto/
├── Project-IRIS-2.0/        # Frontend
│   ├── .env.local           # Frontend environment variables (DO NOT COMMIT)
│   └── .env.example         # Frontend example template
└── backend/                 # Backend
    ├── .env                 # Backend environment variables (DO NOT COMMIT)
    └── .env.example         # Backend example template
```

## 🔧 Backend Configuration (`backend/.env`)

### Server Configuration
```env
PORT=5000                              # Backend server port
BACKEND_URL=http://localhost:5000      # Backend base URL
FRONTEND_URL=http://localhost:5173     # Frontend URL (for CORS)
```

**Usage in code:**
```typescript
// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Port
const PORT = process.env.PORT || 5000;
```

### Database Configuration
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
```

**Usage in code:**
```typescript
mongoose.connect(process.env.MONGO_URI!)
```

### Authentication Configuration
```env
JWT_SECRET=your_super_secret_jwt_key_here
```

**Usage in code:**
```typescript
const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
```

### Cloudinary Configuration
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

**Usage in code:**
```typescript
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
```

### Razorpay Configuration
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key_here
```

**Usage in code:**
```typescript
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!
});
```

## 🎨 Frontend Configuration (`Project-IRIS-2.0/.env.local`)

### API Configuration
```env
VITE_API_BASE_URL=http://localhost:5000/api     # Backend API endpoint
VITE_FRONTEND_URL=http://localhost:5173         # Frontend base URL
```

**Usage in code:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL
});
```

### Gemini AI Configuration
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**Usage in code:**
```typescript
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
```

## 🚀 Production Configuration

### For Backend (Production)
```env
PORT=5000
BACKEND_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
MONGO_URI=mongodb+srv://production_credentials
JWT_SECRET=production_secure_secret
# ... other production credentials
```

### For Frontend (Production)
```env
VITE_API_BASE_URL=https://api.yourdomain.com/api
VITE_FRONTEND_URL=https://yourdomain.com
VITE_GEMINI_API_KEY=your_production_gemini_key
```

## 🔐 Security Best Practices

1. **Never commit `.env` or `.env.local` files** - Already added to `.gitignore`
2. **Use different credentials for development and production**
3. **Keep JWT_SECRET strong** - Use at least 32 random characters
4. **Rotate keys regularly** - Especially for production
5. **Use environment-specific keys** - Test keys for dev, live keys for prod

## 📝 Setup Instructions

### Initial Setup

1. **Backend Setup:**
```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

2. **Frontend Setup:**
```bash
cd Project-IRIS-2.0
cp .env.example .env.local
# Edit .env.local with your credentials
npm install
npm run dev
```

### Verify Configuration

1. **Backend Health Check:**
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok","message":"IRIS Backend is running"}
```

2. **Frontend Check:**
- Open browser to `http://localhost:5173`
- Check browser console for API connection
- Try registering a new user

## 🔄 Changing URLs

### Scenario: Change Backend Port from 5000 to 8080

1. **Update Backend `.env`:**
```env
PORT=8080
BACKEND_URL=http://localhost:8080
```

2. **Update Frontend `.env.local`:**
```env
VITE_API_BASE_URL=http://localhost:8080/api
```

3. **Restart both servers**

### Scenario: Deploy to Production

1. **Update Backend `.env` with production URL:**
```env
BACKEND_URL=https://api.iris-vision.com
FRONTEND_URL=https://iris-vision.com
```

2. **Update Frontend `.env.local` with production URL:**
```env
VITE_API_BASE_URL=https://api.iris-vision.com/api
VITE_FRONTEND_URL=https://iris-vision.com
```

3. **Build and deploy:**
```bash
# Backend
cd backend
npm run build

# Frontend
cd Project-IRIS-2.0
npm run build
```

## 🐛 Troubleshooting

### CORS Errors
- Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check that backend CORS is configured with `process.env.FRONTEND_URL`

### API Connection Failed
- Verify `VITE_API_BASE_URL` in frontend `.env.local`
- Check backend is running on the specified port
- Use browser DevTools Network tab to see actual request URLs

### Environment Variables Not Loading
- **Frontend**: Variable names must start with `VITE_`
- **Backend**: Run `npm run dev` to reload environment
- **Frontend**: Restart Vite dev server after changing `.env.local`

## 📚 Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Express.js CORS](https://expressjs.com/en/resources/middleware/cors.html)
- [MongoDB Connection Strings](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [Cloudinary Setup](https://cloudinary.com/documentation)
- [Razorpay Integration](https://razorpay.com/docs/)
